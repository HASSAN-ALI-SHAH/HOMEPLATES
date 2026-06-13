const express = require('express');
const Order = require('../models/Order');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const WalletTransaction = require('../models/WalletTransaction');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/mailer');
const authMiddleware = require('../middleware/auth');

module.exports = (io) => {
  const router = express.Router();

  // ----------------------------------------------------
  // 1. Place a New Order
  // ----------------------------------------------------
  router.post('/place', async (req, res) => {
    try {
      const { user, chef, items, totalAmount, deliveryAddress, paymentMethod, deliveryCharges } = req.body;

      const newOrder = new Order({
        user,
        chef,
        items,
        totalAmount,
        deliveryAddress,
        deliveryCharges: deliveryCharges || 150,
        paymentMethod: paymentMethod || 'cash',
        status: 'pending'
      });

      await newOrder.save();

      // Post-placement: Add earnings to chef's pendingBalance (chef gets the food subtotal)
      const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const chefEarning = subtotal;
      await User.findByIdAndUpdate(chef, { $inc: { pendingBalance: chefEarning } });

      // Send Email to Customer
      const customer = await User.findById(user);
      if (customer && customer.email) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #1A2316;">Order Confirmed!</h2>
            <p>Hello ${customer.name},</p>
            <p>Your order (ID: <strong>${newOrder._id}</strong>) has been successfully placed.</p>
            <p><strong>Total:</strong> PKR ${totalAmount}</p>
            <p><strong>Payment:</strong> ${paymentMethod.toUpperCase()}</p>
            <p>Our chef is preparing your delicious home-cooked meal!</p>
            <p>Regards,<br/>HomePlates Team</p>
          </div>
        `;
        await sendEmail(customer.email, `Order Confirmed — Order #${newOrder._id}`, emailHtml);
      }

      // Emit Real-time Socket Event to Chef
      io.to(`chef_${chef}`).emit('new_order_notification', {
        orderId: newOrder._id,
        status: 'pending',
        message: 'You have a new order!'
      });

      res.status(201).json({ message: 'Order placed successfully!', order: newOrder });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 2. Get Customer's Orders
  // ----------------------------------------------------
  router.get('/my-orders/:userId', async (req, res) => {
    try {
      const orders = await Order.find({ user: req.params.userId })
        .populate('chef', 'name phone specialty kitchenName about img')
        .populate('rider', 'name phone')
        .populate('items.dishId', 'name img')
        .sort({ createdAt: -1 });
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 3. Get Chef's Orders  ⚠ MUST BE BEFORE /:orderId
  // ----------------------------------------------------
  router.get('/chef/:chefId', async (req, res) => {
    try {
      const { status } = req.query;
      let query = { chef: req.params.chefId };
      if (status) query.status = status;

      const orders = await Order.find(query)
        .populate('user', 'name phone address')
        .populate('rider', 'name phone')
        .populate('items.dishId', 'name img')
        .sort({ createdAt: -1 });

      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 4. Get Available Orders for Rider  ⚠ MUST BE BEFORE /:orderId
  // ----------------------------------------------------
  router.get('/rider/available', async (req, res) => {
    try {
      // Orders become available for rider when chef marks them 'ready-for-pickup'
      const orders = await Order.find({
        status: 'ready-for-pickup',
        $or: [{ rider: null }, { rider: { $exists: false } }]
      })
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img')
        .populate('items.dishId', 'name img price')
        .sort({ createdAt: -1 });

      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 5. Get Active Order for Rider  ⚠ MUST BE BEFORE /:orderId
  // ----------------------------------------------------
  router.get('/rider/active/:riderId', async (req, res) => {
    try {
      const order = await Order.findOne({
        rider: req.params.riderId,
        status: { $nin: ['delivered', 'cancelled'] }
      })
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img')
        .populate('items.dishId', 'name img price');

      res.json(order || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 6. Get Single Order Details  ⚠ GENERIC ROUTE — KEEP LAST AMONG GETs
  // ----------------------------------------------------
  router.get('/:orderId', async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone specialty kitchenImage location address kitchenName about img')
        .populate('rider', 'name phone location')
        .populate('items.dishId', 'name img price');

      if (!order) return res.status(404).json({ message: 'Order not found' });
      res.json(order);
    } catch (err) {
      console.error("Error getting order by ID:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 7. Update Order Status (Linear Flow)
  // ----------------------------------------------------
  router.patch('/:orderId/status', async (req, res) => {
    try {
      const { status, cancellationReason, riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const oldStatus = order.status;
      if (oldStatus === 'delivered' || oldStatus === 'cancelled') {
        return res.status(400).json({ message: `Cannot update status. Order is already ${oldStatus}.` });
      }

      order.status = status;
      if (cancellationReason) order.cancellationReason = cancellationReason;
      if (riderId) order.rider = riderId;

      await order.save();

      const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const chefEarning = subtotal;

      if (status === 'delivered') {
        let platformFeePercent = 10;
        try {
          const platformSettings = await Settings.findOne();
          if (platformSettings) platformFeePercent = platformSettings.platformFee;
        } catch (settingsErr) {
          console.error("Error fetching settings, using 10% default", settingsErr);
        }
        const commission = Math.round(subtotal * (platformFeePercent / 100));
        const chefEarningNet = chefEarning - commission;

        // Transfer from pendingBalance to active wallet for chef
        await User.findByIdAndUpdate(order.chef, {
          $inc: { wallet: chefEarningNet, pendingBalance: -chefEarning }
        });
        await WalletTransaction.create({
          chefId: order.chef,
          type: 'credit',
          amount: chefEarningNet,
          orderId: order._id,
          status: 'approved'
        });

        // Rider payout
        if (order.rider) {
          const deliveryFee = order.deliveryCharges || 150;
          await User.findByIdAndUpdate(order.rider, { $inc: { wallet: deliveryFee } });
          await WalletTransaction.create({
            chefId: order.rider, // Field reused for rider ID
            type: 'credit',
            amount: deliveryFee,
            orderId: order._id,
            status: 'approved'
          });

          // Notify rider of payment
          io.to(`rider_${order.rider}`).emit('delivery_complete', {
            orderId: order._id,
            earning: deliveryFee,
            message: `Delivery complete! PKR ${deliveryFee} added to your wallet.`
          });
        }

        // Increment deliveredDays for daily subscription order
        if (order.isSubscriptionOrder) {
          try {
            let subscription;
            if (order.subscriptionId) {
              subscription = await Subscription.findById(order.subscriptionId);
            } else {
              // Fallback query
              subscription = await Subscription.findOne({
                userId: order.user,
                chefId: order.chef,
                status: 'active'
              });
            }
            if (subscription) {
              subscription.deliveredDays = (subscription.deliveredDays || 0) + 1;
              await subscription.save();
              console.log(`📈 Incremented subscription (${subscription._id}) deliveredDays to ${subscription.deliveredDays}`);
            }
          } catch (subErr) {
            console.error("Failed to update subscription deliveredDays:", subErr);
          }
        }

        // Email customer
        const customer = await User.findById(order.user);
        if (customer && customer.email) {
          await sendEmail(customer.email, `Order Delivered — #${order._id}`,
            `<h2 style="color:green;">Order Delivered!</h2><p>Your order was delivered successfully. Enjoy your meal!</p>`
          );
        }

        // Emit notification to admin
        try {
          const chefObj = await User.findById(order.chef);
          const custObj = await User.findById(order.user);
          io.to('admin_room').emit('delivery_update', {
            message: `Order #${order._id.slice(-6)} has been marked as delivered by Chef ${chefObj?.name || 'Chef'} to ${custObj?.name || 'Customer'}.`
          });
        } catch (socketErr) {
          console.error("Socket emit failed on delivery complete:", socketErr);
        }

      } else if (status === 'cancelled') {
        if (oldStatus !== 'delivered' && oldStatus !== 'cancelled') {
          await User.findByIdAndUpdate(order.chef, { $inc: { pendingBalance: -chefEarning } });
        }
      }

      // Emit real-time updates
      io.to(`order_${order._id}`).emit('order_status_changed', { orderId: order._id, status, cancellationReason });
      io.to(`chef_${order.chef}`).emit('new_order_notification', { orderId: order._id, status });

      // 🚴 When food is ready — notify ALL online riders in real-time
      if (status === 'ready-for-pickup') {
        const populatedOrder = await Order.findById(order._id)
          .populate('user', 'name phone address')
          .populate('chef', 'name phone address specialty kitchenName about img')
          .populate('items.dishId', 'name img price');
        io.to('riders_online').emit('new_delivery_available', {
          order: populatedOrder,
          message: `🍽️ Food ready at ${populatedOrder.chef?.name}! PKR ${order.deliveryCharges || 150} delivery fee.`
        });
      }

      if (order.rider) {
        io.to(`rider_${order.rider}`).emit('order_status_changed', { orderId: order._id, status });
      }

      res.json({ message: 'Status updated!', order });
    } catch (err) {
      console.error("Error updating order status:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 8. Accept Order (Rider)
  // ----------------------------------------------------
  router.patch('/:orderId/accept', async (req, res) => {
    try {
      const { riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.rider) return res.status(400).json({ message: 'Order already has a rider' });

      order.rider = riderId;
      order.status = 'ready-for-pickup'; // Keep status as ready-for-pickup but assign the rider
      await order.save();

      // Populate for response
      const populatedOrder = await Order.findById(order._id)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img')
        .populate('items.dishId', 'name img price');

      // Emit notifications
      io.to(`order_${order._id}`).emit('order_status_changed', { orderId: order._id, status: 'ready-for-pickup', riderId });
      io.to(`chef_${order.chef}`).emit('new_order_notification', { orderId: order._id, status: 'ready-for-pickup', message: 'A rider has accepted your order and is heading to your kitchen.' });
      io.to(`rider_${riderId}`).emit('order_assigned', { orderId: order._id, order: populatedOrder, message: 'Order accepted successfully!' });
      // 🔔 Notify ALL other riders this order is taken — so they refresh their list
      io.to('riders_online').emit('order_taken', { orderId: order._id });

      res.json({ message: 'Order accepted!', order: populatedOrder });
    } catch (err) {
      console.error("Error rider accepting order:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 9. Update Live Location (Rider)
  // ----------------------------------------------------
  router.patch('/:orderId/location', async (req, res) => {
    try {
      const { lat, lng } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      order.currentLocation = { lat, lng };
      await order.save();

      io.to(`order_${order._id}`).emit('location_update', { lat, lng });
      res.json({ message: 'Location updated', currentLocation: order.currentLocation });
    } catch (err) {
      console.error("Error updating location:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
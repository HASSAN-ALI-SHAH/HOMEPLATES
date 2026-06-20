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
      const { user, chef, items, totalAmount, deliveryAddress, paymentMethod, deliveryCharges, deliveryLocation } = req.body;

      // Block ordering from OFFLINE chefs
      const chefUser = await User.findById(chef);
      if (!chefUser) return res.status(404).json({ message: 'Chef not found' });
      if (chefUser.isActive === false) {
        return res.status(400).json({ message: 'This chef is currently offline and not accepting orders.' });
      }
      if (!chefUser.isVerified) {
        return res.status(400).json({ message: 'This chef is not yet verified.' });
      }

      // Build pickup coordinates from chef's saved kitchen location
      const pickupLocation =
        chefUser.location?.lat && chefUser.location?.lng
          ? { lat: chefUser.location.lat, lng: chefUser.location.lng }
          : undefined;

      const newOrder = new Order({
        user,
        chef,
        items,
        totalAmount,
        deliveryAddress,
        deliveryCharges: deliveryCharges || 150,
        paymentMethod: paymentMethod || 'cash',
        status: 'pending',
        // Store GPS coordinates at placement time — used directly by map, no geocoding needed
        pickupLocation,
        deliveryLocation:
          deliveryLocation?.lat && deliveryLocation?.lng ? deliveryLocation : undefined,
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
            <p>Our chef is reviewing your order. You'll be notified once it's accepted!</p>
            <p>Regards,<br/>HomePlates Team</p>
          </div>
        `;
        await sendEmail(customer.email, `Order Confirmed — Order #${newOrder._id}`, emailHtml);
      }

      // Emit Real-time Socket Event to Chef (new order = pending)
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
  router.get('/rider/available', authMiddleware, async (req, res) => {
    try {
      const rider = await User.findById(req.user.id);
      if (!rider) return res.status(404).json({ message: "Rider not found" });

      const riderCity = rider.city || 'Lahore';
      const chefsInCity = await User.find({ role: 'chef', city: riderCity }).select('_id');
      const chefIds = chefsInCity.map(c => c._id);

      // Orders become available for rider when chef marks them 'ready-for-pickup'
      const orders = await Order.find({
        status: 'ready-for-pickup',
        $or: [{ rider: null }, { rider: { $exists: false } }],
        chef: { $in: chefIds },
        ignoredBy: { $ne: req.user.id }
      })
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city location')
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
        .populate('chef', 'name phone address specialty kitchenName about img location')
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
  router.patch('/:orderId/status', authMiddleware, async (req, res) => {
    try {
      const { status, cancellationReason, riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const oldStatus = order.status;
      if (oldStatus === 'delivered' || oldStatus === 'cancelled' || oldStatus === 'delivery-failed') {
        return res.status(400).json({ message: `Cannot update status. Order is already ${oldStatus}.` });
      }

      order.status = status;
      if (cancellationReason) order.cancellationReason = cancellationReason;
      if (riderId) order.rider = riderId;

      // Update statusHistory
      const updaterId = req.user?.id || riderId || order.chef;
      order.statusHistory.push({ status, updatedBy: updaterId });

      await order.save();

      const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const chefEarning = subtotal;

      // --- DELIVERED ---
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
            chefId: order.rider,
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
          io.to('admin_room').emit('delivery_update', {
            message: `Order #${order._id.toString().slice(-6)} has been marked as delivered.`
          });
        } catch (socketErr) {
          console.error("Socket emit failed on delivery complete:", socketErr);
        }

        // FIX #2: Notify chef their order is delivered
        io.to(`chef_${order.chef}`).emit('new_order_notification', {
          orderId: order._id,
          status: 'delivered',
          message: '✅ Order delivered successfully! Payment added to your wallet.'
        });

      // --- CANCELLED / FAILED ---
      } else if (status === 'cancelled' || status === 'delivery-failed') {
        if (oldStatus !== 'delivered' && oldStatus !== 'cancelled' && oldStatus !== 'delivery-failed') {
          await User.findByIdAndUpdate(order.chef, { $inc: { pendingBalance: -chefEarning } });
        }

        // Notify customer via email (only for cancellations)
        if (status === 'cancelled') {
          const customer = await User.findById(order.user);
          const reason = cancellationReason || 'Order was cancelled';

          if (customer && customer.email) {
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                <h2 style="color: #e53e3e;">Order Cancelled</h2>
                <p>Hello ${customer.name},</p>
                <p>Unfortunately, your order <strong>#${order._id}</strong> was cancelled.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>Please try ordering from another chef or place a new order.</p>
                <p>We're sorry for the inconvenience.</p>
                <p>Regards,<br/>HomePlates Team</p>
              </div>
            `;
            await sendEmail(customer.email, `Order Cancelled — #${order._id}`, emailHtml).catch(e => console.error('Email error:', e));
          }
        }

        // Notify the user via socket in real-time (on tracking page)
        io.to(`order_${order._id}`).emit('order_cancelled_by_chef', {
          orderId: order._id,
          message: `Your order was cancelled. Reason: ${cancellationReason || 'Logistics update'}`,
          reason: cancellationReason || 'Logistics update'
        });

        // Also notify user via their personal room (even if not on tracking page)
        io.to(`user_${order.user}`).emit('order_notification', {
          type: status === 'cancelled' ? 'order_cancelled' : 'delivery_failed',
          orderId: order._id,
          message: status === 'cancelled'
            ? `Your order was cancelled. Reason: ${cancellationReason || 'Logistics update'}`
            : `Delivery failed for your order. Reason: ${cancellationReason || 'Could not deliver'}`,
        });
      }

      // Emit real-time updates to customer tracking page
      io.to(`order_${order._id}`).emit('order_status_changed', { orderId: order._id, status, cancellationReason });
      
      // Also push to user's personal room for global notifications
      io.to(`user_${order.user}`).emit('order_notification', {
        type: 'status_update',
        orderId: order._id,
        status,
        message: status === 'delivered'
          ? '✅ Your order has been delivered successfully!'
          : status === 'out-for-delivery'
          ? '🚴 Your order is out for delivery!'
          : `Your order status changed to: ${status}`
      });
      
      // Emit real-time updates to Chef Dashboard
      io.to(`chef_${order.chef}`).emit('new_order_notification', { 
        orderId: order._id, 
        status,
        message: `Order status updated to: ${status}`
      });

      // Emit to Admin Dashboard
      try {
        io.to('admin_room').emit('delivery_update', {
          message: `Order #${order._id.toString().slice(-6)} status updated to ${status}.`
        });
      } catch (socketErr) {
        console.error("Socket emit failed on admin update:", socketErr);
      }

      // 🚴 When food is ready — notify online city riders in real-time
      if (status === 'ready-for-pickup') {
        const populatedOrder = await Order.findById(order._id)
          .populate('user', 'name phone address')
          .populate('chef', 'name phone address specialty kitchenName about img city')
          .populate('items.dishId', 'name img price');
        
        const chefCity = populatedOrder.chef?.city;
        if (chefCity) {
          const cityRoom = `riders_${chefCity.toLowerCase()}`;
          io.to(cityRoom).emit('new_delivery_available', {
            order: populatedOrder,
            message: `New delivery request available.`
          });
        }
      }

      // Only notify rider of status changes if not updated by this rider themselves
      const isRiderUpdating = req.user && req.user.role === 'rider';
      if (order.rider && !isRiderUpdating) {
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
  // FIX #2: After rider accepts, THEN notify chef that rider is coming
  // ----------------------------------------------------
  router.patch('/:orderId/accept', authMiddleware, async (req, res) => {
    try {
      const { riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.rider) return res.status(400).json({ message: 'Order already has a rider' });

      order.rider = riderId || req.user.id;
      order.status = 'ready-for-pickup'; // Keep status but assign the rider
      
      // Update statusHistory
      order.statusHistory.push({ status: 'rider_accepted', updatedBy: req.user.id || riderId });

      await order.save();

      // Populate for response
      const populatedOrder = await Order.findById(order._id)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city')
        .populate('items.dishId', 'name img price');

      // FIX #2: ONLY NOW tell the chef a rider has been assigned (rider accepted FIRST)
      io.to(`chef_${order.chef}`).emit('new_order_notification', {
        orderId: order._id,
        status: 'rider_accepted',
        message: 'A rider has accepted your delivery request.'
      });

      // Emit to the order room (tracked by customer)
      io.to(`order_${order._id}`).emit('order_status_changed', {
        orderId: order._id,
        status: 'ready-for-pickup',
        riderId: order.rider
      });

      // Confirm to the accepting rider
      io.to(`rider_${order.rider}`).emit('order_assigned', {
        orderId: order._id,
        order: populatedOrder,
        message: 'Order accepted successfully!'
      });

      // Notify other riders in the same city this order is taken — so they refresh their list
      const chefCity = populatedOrder.chef?.city;
      if (chefCity) {
        const cityRoom = `riders_${chefCity.toLowerCase()}`;
        io.to(cityRoom).emit('order_taken', { orderId: order._id });
      }

      res.json({ message: 'Order accepted!', order: populatedOrder });
    } catch (err) {
      console.error("Error rider accepting order:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 9. Reject Order (Rider) — FIX #5: New endpoint
  // Rider can reject/unassign themselves from an order
  // ----------------------------------------------------
  router.patch('/:orderId/reject', authMiddleware, async (req, res) => {
    try {
      const { riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const finalRiderId = riderId || req.user.id;
      // Only the assigned rider can reject
      if (order.rider && order.rider.toString() !== finalRiderId.toString()) {
        return res.status(403).json({ message: 'Only the assigned rider can reject this order' });
      }

      // Unassign the rider and put order back to ready-for-pickup
      order.rider = null;
      order.status = 'ready-for-pickup';
      
      // Update statusHistory
      order.statusHistory.push({ status: 'rider_rejected', updatedBy: finalRiderId });

      await order.save();

      const populatedOrder = await Order.findById(order._id)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city')
        .populate('items.dishId', 'name img price');

      // Notify chef that the previous rider rejected
      io.to(`chef_${order.chef}`).emit('new_order_notification', {
        orderId: order._id,
        status: 'rider_rejected',
        message: '⚠️ A rider rejected your order. Another rider will be assigned soon.'
      });

      // Broadcast back to all online riders in the same city — order is available again
      const chefCity = populatedOrder.chef?.city;
      if (chefCity) {
        const cityRoom = `riders_${chefCity.toLowerCase()}`;
        io.to(cityRoom).emit('new_delivery_available', {
          order: populatedOrder,
          message: `New delivery request available.`
        });
      }

      res.json({ message: 'Order rejected, re-broadcasting to riders.', order: populatedOrder });
    } catch (err) {
      console.error("Error rider rejecting order:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 10. Update Live Location (Rider)
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

  // ----------------------------------------------------
  // 11. Ignore Order (Rider)
  // ----------------------------------------------------
  router.patch('/:orderId/ignore', authMiddleware, async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      // Add riderId to order's ignoredBy array if not already present
      if (!order.ignoredBy.includes(req.user.id)) {
        order.ignoredBy.push(req.user.id);
        
        // Update statusHistory
        order.statusHistory.push({ status: 'rider_ignored', updatedBy: req.user.id });
        
        await order.save();
      }

      res.json({ message: 'Order ignored successfully', order });
    } catch (err) {
      console.error("Error rider ignoring order:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
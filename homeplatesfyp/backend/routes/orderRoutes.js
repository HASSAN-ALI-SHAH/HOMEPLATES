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

  // ─── Helper: emit notification safely ─────────────────────────────────────
  const safeEmit = (room, event, data) => {
    try { io.to(room).emit(event, data); } catch (_) {}
  };

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
        pickupLocation,
        deliveryLocation:
          deliveryLocation?.lat && deliveryLocation?.lng ? deliveryLocation : undefined,
      });

      await newOrder.save();

      // Post-placement: Add earnings to chef's pendingBalance
      const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      await User.findByIdAndUpdate(chef, { $inc: { pendingBalance: subtotal } });

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
      safeEmit(`chef_${chef}`, 'new_order_notification', {
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
  // B13: Only include rider phone when order is in transit
  // ----------------------------------------------------
  router.get('/my-orders/:userId', async (req, res) => {
    try {
      const orders = await Order.find({ user: req.params.userId })
        .populate('chef', 'name phone specialty kitchenName about img')
        .populate('rider', 'name')           // B13: no phone in list fetch
        .populate('items.dishId', 'name img')
        .sort({ createdAt: -1 })
        .lean();

      // B13: Conditionally add rider phone only when in active transit
      const inTransitStatuses = ['picked-up', 'out-for-delivery'];
      const ordersWithGatedPhone = orders.map(order => {
        if (order.rider && inTransitStatuses.includes(order.status)) {
          // Need to fetch phone separately for in-transit orders
          return { ...order, _riderPhoneVisible: true };
        }
        return order;
      });

      res.json(ordersWithGatedPhone);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── B13 helper: Get rider phone for in-transit orders only ────────────────
  router.get('/:orderId/rider-phone', authMiddleware, async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId)
        .populate('rider', 'name phone');

      if (!order) return res.status(404).json({ message: 'Order not found' });

      const inTransitStatuses = ['picked-up', 'out-for-delivery'];
      if (!inTransitStatuses.includes(order.status)) {
        return res.status(403).json({ message: 'Rider contact details are only available once the order is picked up.' });
      }
      if (!order.rider) return res.status(404).json({ message: 'No rider assigned' });

      res.json({ name: order.rider.name, phone: order.rider.phone });
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
      if (!rider) return res.status(404).json({ message: 'Rider not found' });

      // B1: Block suspended riders from fetching available orders
      if (rider.isActive === false) {
        return res.status(403).json({ message: 'Your account is suspended. Contact admin.' });
      }

      const riderCity = rider.city || 'Lahore';
      const chefsInCity = await User.find({ role: 'chef', city: riderCity }).select('_id');
      const chefIds = chefsInCity.map(c => c._id);

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
        status: { $nin: ['delivered', 'cancelled', 'delivery-failed', 'rider_cancelled'] }
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

      // FIX: [B13] - Gate rider phone number based on status
      const orderObj = order.toObject();
      const inTransitStatuses = ['picked-up', 'out-for-delivery'];
      if (orderObj.rider && !inTransitStatuses.includes(orderObj.status)) {
        delete orderObj.rider.phone;
      }

      res.json(orderObj);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 7. Update Order Status (Linear Flow)
  // B1: Check rider suspension on status changes
  // B8: Unassign rider on delivery-failed
  // B9: Notify chef+user on delivery-failed
  // B12: Notify chef when rider cancels
  // ----------------------------------------------------
  router.patch('/:orderId/status', authMiddleware, async (req, res) => {
    try {
      const { status, cancellationReason, failureReason, riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const oldStatus = order.status;
      if (['delivered', 'cancelled', 'delivery-failed', 'rider_cancelled'].includes(oldStatus)) {
        return res.status(400).json({ message: `Cannot update status. Order is already ${oldStatus}.` });
      }

      // B1: If a rider is updating status, verify they are not suspended
      if (req.user && req.user.role === 'rider') {
        const riderUser = await User.findById(req.user.id);
        if (!riderUser || riderUser.isActive === false) {
          return res.status(403).json({ message: 'Your account is suspended. Contact admin.' });
        }
      }

      order.status = status;
      if (cancellationReason) {
        order.cancellationReason = cancellationReason;
      } else if (['preparing', 'ready-for-pickup', 'picked-up', 'out-for-delivery', 'delivered'].includes(status)) {
        order.cancellationReason = undefined;
      }

      if (failureReason) {
        order.failureReason = failureReason;
      } else if (['preparing', 'ready-for-pickup', 'picked-up', 'out-for-delivery', 'delivered'].includes(status)) {
        order.failureReason = undefined;
      }
      if (riderId) order.rider = riderId;

      const updaterId = req.user?.id || riderId || order.chef;
      order.statusHistory.push({ status, updatedBy: updaterId });

      await order.save();

      const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const chefEarning = subtotal;

      // ─── DELIVERED ──────────────────────────────────────────────────────────
      if (status === 'delivered') {
        let platformFeePercent = 10;
        try {
          const platformSettings = await Settings.findOne();
          if (platformSettings) platformFeePercent = platformSettings.platformFee;
        } catch (_) {}
        const commission = Math.round(subtotal * (platformFeePercent / 100));
        const chefEarningNet = chefEarning - commission;

        await User.findByIdAndUpdate(order.chef, {
          $inc: { wallet: chefEarningNet, pendingBalance: -chefEarning }
        });
        await WalletTransaction.create({
          chefId: order.chef, type: 'credit', amount: chefEarningNet,
          orderId: order._id, status: 'approved'
        });

        if (order.rider) {
          const deliveryFee = order.deliveryCharges || 150;
          await User.findByIdAndUpdate(order.rider, { $inc: { wallet: deliveryFee } });
          await WalletTransaction.create({
            chefId: order.rider, type: 'credit', amount: deliveryFee,
            orderId: order._id, status: 'approved'
          });
          safeEmit(`rider_${order.rider}`, 'delivery_complete', {
            orderId: order._id,
            earning: deliveryFee,
            message: `Delivery complete! PKR ${deliveryFee} added to your wallet.`
          });
        }

        if (order.isSubscriptionOrder) {
          try {
            let subscription = order.subscriptionId
              ? await Subscription.findById(order.subscriptionId)
              : await Subscription.findOne({ userId: order.user, chefId: order.chef, status: 'active' });
            if (subscription) {
              subscription.deliveredDays = (subscription.deliveredDays || 0) + 1;
              await subscription.save();
            }
          } catch (_) {}
        }

        const customer = await User.findById(order.user);
        if (customer && customer.email) {
          await sendEmail(customer.email, `Order Delivered — #${order._id}`,
            `<h2 style="color:green;">Order Delivered!</h2><p>Your order was delivered successfully. Enjoy your meal!</p>`
          );
        }

        safeEmit('admin_room', 'delivery_update', {
          message: `Order #${order._id.toString().slice(-6)} has been marked as delivered.`
        });
        safeEmit(`chef_${order.chef}`, 'new_order_notification', {
          orderId: order._id, status: 'delivered',
          message: '✅ Order delivered successfully! Payment added to your wallet.'
        });

      // ─── DELIVERY FAILED ─────────────────────────────────────────────────────
      // B8: Unassign rider; B9: notify chef + user + admin
      } else if (status === 'delivery-failed') {
        // Reverse pending balance from chef (food not delivered)
        await User.findByIdAndUpdate(order.chef, { $inc: { pendingBalance: -chefEarning } });

        const prevRider = order.rider;
        order.rider = null;         // B8: unassign rider so they can take new orders
        await order.save();

        // B9: Notify chef
        safeEmit(`chef_${order.chef}`, 'new_order_notification', {
          orderId: order._id, status: 'delivery-failed',
          message: `⚠️ Delivery failed for Order #${order._id.toString().slice(-6)}. Reason: ${failureReason || 'Unable to deliver'}. Please take action.`
        });
        // B9: Notify customer
        safeEmit(`order_${order._id}`, 'order_status_changed', {
          orderId: order._id, status: 'delivery-failed',
          message: `Delivery was unsuccessful. Reason: ${failureReason || 'Rider could not complete delivery'}`
        });
        safeEmit(`user_${order.user}`, 'order_notification', {
          type: 'delivery_failed', orderId: order._id,
          message: `Your delivery was unsuccessful. Reason: ${failureReason || 'Rider could not complete delivery'}`
        });
        // B9: Notify admin
        safeEmit('admin_room', 'delivery_update', {
          message: `⚠️ Delivery failed for Order #${order._id.toString().slice(-6)}.`
        });

        // Send email to customer
        const customer = await User.findById(order.user);
        if (customer && customer.email) {
          await sendEmail(customer.email, `Delivery Issue — Order #${order._id}`,
            `<h2 style="color:#e53e3e;">Delivery Unsuccessful</h2>
             <p>Hello ${customer.name},</p>
             <p>Unfortunately our rider could not complete your delivery for Order <strong>#${order._id}</strong>.</p>
             <p><strong>Reason:</strong> ${failureReason || 'Rider was unable to deliver'}</p>
             <p>Your chef is reviewing the situation and will take further action.</p>
             <p>Regards,<br/>HomePlates Team</p>`
          ).catch(() => {});
        }

        return res.json({ message: 'Status updated to delivery-failed!', order });

      // ─── RIDER CANCELLED ─────────────────────────────────────────────────────
      // B12: distinct rider_cancelled status + notify chef
      // B1: Deduct penalty from rider wallet if they cancelled after picking up
      } else if (status === 'rider_cancelled') {
        const prevRider = order.rider;
        const cancelledAfterPickup = ['picked-up', 'out-for-delivery'].includes(oldStatus);

        order.rider = null;
        order.status = 'rider_cancelled';
        // Reset order back to ready-for-pickup so chef can re-assign
        order.status = 'rider_cancelled';
        await order.save();

        // B1: Apply financial penalty if rider cancelled after picking up the food
        let penaltyAmount = 0;
        if (cancelledAfterPickup && prevRider) {
          penaltyAmount = subtotal; // Full order amount deducted as penalty
          const riderBeforePenalty = await User.findById(prevRider);
          const currentWallet = riderBeforePenalty?.wallet || 0;
          // Deduct from wallet (allow going to 0 minimum — no negative balance)
          const actualDeduction = Math.min(penaltyAmount, currentWallet);
          await User.findByIdAndUpdate(prevRider, { $inc: { wallet: -actualDeduction } });
          await WalletTransaction.create({
            chefId: prevRider,
            type: 'debit',
            amount: actualDeduction,
            orderId: order._id,
            status: 'approved',
            accountDetails: `Penalty: Order #${order._id.toString().slice(-6)} cancelled after pickup`
          });
          // Notify rider about deduction
          safeEmit(`rider_${prevRider}`, 'order_status_changed', {
            orderId: order._id,
            status: 'rider_cancelled',
            message: `⚠️ PKR ${actualDeduction.toLocaleString()} has been deducted from your wallet as a penalty for cancelling Order #${order._id.toString().slice(-6)} after picking up the food.`
          });
        }

        // B12: Notify chef immediately with re-assign instructions
        const riderUser = prevRider ? await User.findById(prevRider).select('name') : null;
        const penaltyMsg = cancelledAfterPickup && penaltyAmount > 0
          ? ` A penalty of PKR ${penaltyAmount.toLocaleString()} has been applied to the rider.`
          : '';
        safeEmit(`chef_${order.chef}`, 'new_order_notification', {
          orderId: order._id, status: 'rider_cancelled',
          message: `⚠️ Rider${riderUser ? (' ' + riderUser.name) : ''} cancelled Order #${order._id.toString().slice(-6)} after pickup.${penaltyMsg} Please re-assign a new rider.`
        });
        // Notify customer
        safeEmit(`order_${order._id}`, 'order_status_changed', {
          orderId: order._id, status: 'rider_cancelled',
          message: 'The rider cancelled your delivery. The chef is assigning a new rider — your order is safe.'
        });
        safeEmit(`user_${order.user}`, 'order_notification', {
          type: 'rider_cancelled', orderId: order._id,
          message: '🔄 Your rider cancelled. We are finding a new rider. Your order is being re-assigned — please wait.'
        });
        return res.json({ message: 'Order marked as rider_cancelled, chef notified, penalty applied.', order, penaltyAmount });

      // ─── CANCELLED / FAILED (legacy) ─────────────────────────────────────────
      } else if (status === 'cancelled') {
        if (!['delivered', 'cancelled', 'delivery-failed', 'rider_cancelled'].includes(oldStatus)) {
          await User.findByIdAndUpdate(order.chef, { $inc: { pendingBalance: -chefEarning } });
        }

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
          await sendEmail(customer.email, `Order Cancelled — #${order._id}`, emailHtml).catch(() => {});
        }

        // B16: Notify chef when user/rider cancels
        safeEmit(`chef_${order.chef}`, 'new_order_notification', {
          orderId: order._id, status: 'cancelled',
          message: `Order #${order._id.toString().slice(-6)} was cancelled. Reason: ${reason}`
        });
        // Notify rider if assigned
        if (order.rider) {
          safeEmit(`rider_${order.rider}`, 'order_status_changed', {
            orderId: order._id, status: 'cancelled',
            message: 'Order was cancelled.'
          });
        }

        safeEmit(`order_${order._id}`, 'order_cancelled_by_chef', {
          orderId: order._id,
          message: `Your order was cancelled. Reason: ${reason}`,
          reason
        });
        safeEmit(`user_${order.user}`, 'order_notification', {
          type: 'order_cancelled', orderId: order._id,
          message: `Your order was cancelled. Reason: ${reason}`
        });
      }

      // Emit real-time updates to customer tracking page and user room
      safeEmit(`order_${order._id}`, 'order_status_changed', { orderId: order._id, status, cancellationReason });
      safeEmit(`user_${order.user}`, 'order_notification', {
        type: 'status_update', orderId: order._id, status,
        message: status === 'delivered'
          ? '✅ Your order has been delivered successfully!'
          : status === 'out-for-delivery'
          ? '🚴 Your order is out for delivery!'
          : `Your order status changed to: ${status}`
      });

      // Emit to Chef Dashboard
      safeEmit(`chef_${order.chef}`, 'new_order_notification', {
        orderId: order._id, status,
        message: `Order status updated to: ${status}`
      });

      // Emit to Admin Dashboard
      safeEmit('admin_room', 'delivery_update', {
        message: `Order #${order._id.toString().slice(-6)} status updated to ${status}.`
      });

      // Notify riders when order is ready-for-pickup
      if (status === 'ready-for-pickup') {
        const populatedOrder = await Order.findById(order._id)
          .populate('user', 'name phone address')
          .populate('chef', 'name phone address specialty kitchenName about img city')
          .populate('items.dishId', 'name img price');

        const chefCity = populatedOrder.chef?.city;
        if (chefCity) {
          safeEmit(`riders_${chefCity.toLowerCase()}`, 'new_delivery_available', {
            order: populatedOrder,
            message: 'New delivery request available.'
          });
        }
      }

      // Notify rider of status changes if not the rider themselves
      const isRiderUpdating = req.user && req.user.role === 'rider';
      if (order.rider && !isRiderUpdating) {
        safeEmit(`rider_${order.rider}`, 'order_status_changed', { orderId: order._id, status });
      }

      res.json({ message: 'Status updated!', order });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 8. Accept Order (Rider)
  // B1: Check rider suspension before accepting
  // ----------------------------------------------------
  router.patch('/:orderId/accept', authMiddleware, async (req, res) => {
    try {
      const { riderId } = req.body;
      const finalRiderId = riderId || req.user.id;

      // B1: Check rider suspension
      const riderUser = await User.findById(finalRiderId);
      if (!riderUser) return res.status(404).json({ message: 'Rider not found' });
      if (riderUser.isActive === false) {
        return res.status(403).json({ message: 'Your account is suspended. Contact admin to resolve.' });
      }

      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.rider) return res.status(400).json({ message: 'Order already has a rider' });

      order.rider = finalRiderId;
      order.status = 'ready-for-pickup';
      order.cancellationReason = undefined;
      order.failureReason = undefined;
      order.statusHistory.push({ status: 'rider_accepted', updatedBy: finalRiderId });
      await order.save();

      const populatedOrder = await Order.findById(order._id)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city')
        .populate('items.dishId', 'name img price');

      safeEmit(`chef_${order.chef}`, 'new_order_notification', {
        orderId: order._id, status: 'rider_accepted',
        message: `🚴 A rider has accepted your delivery for Order #${order._id.toString().slice(-6)}.`
      });

      safeEmit(`order_${order._id}`, 'order_status_changed', {
        orderId: order._id, status: 'ready-for-pickup', riderId: order.rider
      });

      safeEmit(`rider_${order.rider}`, 'order_assigned', {
        orderId: order._id, order: populatedOrder,
        message: 'Order accepted successfully!'
      });

      const chefCity = populatedOrder.chef?.city;
      if (chefCity) {
        safeEmit(`riders_${chefCity.toLowerCase()}`, 'order_taken', { orderId: order._id });
      }

      res.json({ message: 'Order accepted!', order: populatedOrder });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 9. Reject Order (Rider) — Rider unassigns themselves
  // ----------------------------------------------------
  router.patch('/:orderId/reject', authMiddleware, async (req, res) => {
    try {
      const { riderId } = req.body;
      const order = await Order.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const finalRiderId = riderId || req.user.id;
      if (order.rider && order.rider.toString() !== finalRiderId.toString()) {
        return res.status(403).json({ message: 'Only the assigned rider can reject this order' });
      }

      order.rider = null;
      order.status = 'ready-for-pickup';
      order.statusHistory.push({ status: 'rider_rejected', updatedBy: finalRiderId });
      await order.save();

      const populatedOrder = await Order.findById(order._id)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city')
        .populate('items.dishId', 'name img price');

      safeEmit(`chef_${order.chef}`, 'new_order_notification', {
        orderId: order._id, status: 'rider_rejected',
        message: '⚠️ A rider rejected your order. Another rider will be assigned soon.'
      });

      const chefCity = populatedOrder.chef?.city;
      if (chefCity) {
        safeEmit(`riders_${chefCity.toLowerCase()}`, 'new_delivery_available', {
          order: populatedOrder, message: 'New delivery request available.'
        });
      }

      res.json({ message: 'Order rejected, re-broadcasting to riders.', order: populatedOrder });
    } catch (err) {
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

      safeEmit(`order_${order._id}`, 'location_update', { lat, lng });
      res.json({ message: 'Location updated', currentLocation: order.currentLocation });
    } catch (err) {
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

      if (!order.ignoredBy.includes(req.user.id)) {
        order.ignoredBy.push(req.user.id);
        order.statusHistory.push({ status: 'rider_ignored', updatedBy: req.user.id });
        await order.save();
      }

      res.json({ message: 'Order ignored successfully', order });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 12. Resolve Delivery Failure (Chef action)
  // B10: Chef can re-assign riders or cancel order after failure
  // ----------------------------------------------------
  router.patch('/:orderId/resolve-failure', authMiddleware, async (req, res) => {
    try {
      const { action, cancellationReason } = req.body; // action: 'reassign' | 'cancel'
      const order = await Order.findById(req.params.orderId)
        .populate('chef', 'name city');

      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.status !== 'delivery-failed') {
        return res.status(400).json({ message: 'Order is not in delivery-failed state' });
      }

      if (action === 'reassign') {
        order.status = 'ready-for-pickup';
        order.rider = null;
        order.cancellationReason = undefined;
        order.failureReason = undefined;
        order.statusHistory.push({ status: 'reassigning', updatedBy: req.user.id });
        await order.save();

        // Notify customer
        safeEmit(`order_${order._id}`, 'order_status_changed', {
          orderId: order._id, status: 'ready-for-pickup',
          message: 'Chef is re-assigning a rider for your order.'
        });
        safeEmit(`user_${order.user}`, 'order_notification', {
          type: 'status_update', orderId: order._id, status: 'ready-for-pickup',
          message: '🔄 Your order is being reassigned to a new rider.'
        });

        // Re-broadcast to available riders
        const chefCity = order.chef?.city;
        const populatedOrder = await Order.findById(order._id)
          .populate('user', 'name phone address')
          .populate('chef', 'name phone address specialty kitchenName about img city')
          .populate('items.dishId', 'name img price');

        if (chefCity) {
          safeEmit(`riders_${chefCity.toLowerCase()}`, 'new_delivery_available', {
            order: populatedOrder, message: 'Re-assigned delivery request available.'
          });
        }

        return res.json({ message: 'Order re-assigned to available riders.', order });

      } else if (action === 'cancel') {
        const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        order.status = 'cancelled';
        order.cancellationReason = cancellationReason || 'Delivery failed, order cancelled by chef.';
        order.statusHistory.push({ status: 'cancelled', updatedBy: req.user.id });
        await order.save();

        const customer = await User.findById(order.user);
        if (customer && customer.email) {
          await sendEmail(customer.email, `Order Cancelled — #${order._id}`,
            `<h2 style="color:#e53e3e;">Order Cancelled</h2>
             <p>Hello ${customer.name},</p>
             <p>Your order <strong>#${order._id}</strong> was cancelled after a delivery failure.</p>
             <p>We apologize for the inconvenience.</p>
             <p>Regards,<br/>HomePlates Team</p>`
          ).catch(() => {});
        }

        safeEmit(`order_${order._id}`, 'order_cancelled_by_chef', {
          orderId: order._id, message: 'Order cancelled due to delivery failure.', reason: order.cancellationReason
        });
        safeEmit(`user_${order.user}`, 'order_notification', {
          type: 'order_cancelled', orderId: order._id,
          message: 'Your order was cancelled after a delivery failure. We apologize.'
        });

        return res.json({ message: 'Order cancelled after delivery failure.', order });
      }

      return res.status(400).json({ message: "Invalid action. Use 'reassign' or 'cancel'." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 13. Re-broadcast Order to Riders (Chef — B11)
  // For when order is stuck in ready-for-pickup with no rider
  // ----------------------------------------------------
  router.patch('/:orderId/rebroadcast', authMiddleware, async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city')
        .populate('items.dishId', 'name img price');

      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.status !== 'ready-for-pickup') {
        return res.status(400).json({ message: 'Order must be in ready-for-pickup status to re-broadcast.' });
      }

      const chefCity = order.chef?.city;
      if (chefCity) {
        safeEmit(`riders_${chefCity.toLowerCase()}`, 'new_delivery_available', {
          order, message: '🔔 Urgent: Delivery request still available!'
        });
      }

      // Also notify admin
      safeEmit('admin_room', 'delivery_update', {
        message: `⚠️ Order #${order._id.toString().slice(-6)} has no rider — re-broadcast triggered.`
      });

      res.json({ message: 'Order re-broadcast to available riders.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // 14. Reassign order after rider cancellation (Chef action)
  // B1: Chef re-opens the order to available riders after a rider_cancelled event
  // ----------------------------------------------------
  router.patch('/:orderId/reassign-after-cancel', authMiddleware, async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId)
        .populate('chef', 'name city');

      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.status !== 'rider_cancelled') {
        return res.status(400).json({ message: 'Order must be in rider_cancelled state to reassign.' });
      }

      // Reset to ready-for-pickup so riders can see it again
      order.status = 'ready-for-pickup';
      order.rider = null;
      order.ignoredBy = []; // Clear ignore list so all riders see it fresh
      order.cancellationReason = undefined;
      order.failureReason = undefined;
      order.statusHistory.push({ status: 'reassigning', updatedBy: req.user.id });
      await order.save();

      const populatedOrder = await Order.findById(order._id)
        .populate('user', 'name phone address')
        .populate('chef', 'name phone address specialty kitchenName about img city')
        .populate('items.dishId', 'name img price');

      // Notify customer that a new rider is being found
      safeEmit(`order_${order._id}`, 'order_status_changed', {
        orderId: order._id, status: 'ready-for-pickup',
        message: '🔄 Chef is finding a new rider for your order.'
      });
      safeEmit(`user_${order.user}`, 'order_notification', {
        type: 'status_update', orderId: order._id, status: 'ready-for-pickup',
        message: '🔄 Your order has been reassigned. A new rider will be assigned shortly.'
      });

      // Re-broadcast to all available riders in the chef's city
      const chefCity = populatedOrder.chef?.city;
      if (chefCity) {
        safeEmit(`riders_${chefCity.toLowerCase()}`, 'new_delivery_available', {
          order: populatedOrder,
          message: '🍽️ A previously cancelled delivery has been re-opened. Accept now!'
        });
      }

      res.json({ message: 'Order reassigned to available riders.', order: populatedOrder });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
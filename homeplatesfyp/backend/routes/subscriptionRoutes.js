const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const Menu = require('../models/Menu');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const Order = require('../models/Order');
const WalletTransaction = require('../models/WalletTransaction');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const socketHelper = require('../socket');
const sendEmail = require('../utils/mailer');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + path.extname(file.originalname))
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: "Access Denied: Admins Only" });
  }
};

// 1. Add New Meal Plan Subscription (Custom Builder)
router.post('/add', upload.single('screenshot'), async (req, res) => {
  try {
    const { userId, chefId, planType, selectedDays, mealType, startDate, totalCost } = req.body;

    let parsedDays = selectedDays;
    if (typeof selectedDays === 'string') {
      try {
        parsedDays = JSON.parse(selectedDays);
      } catch (e) {
        parsedDays = selectedDays.split(',').map(d => d.trim());
      }
    }

    if (!parsedDays || parsedDays.length === 0) {
      return res.status(400).json({ message: "Subscription selectedDays must include at least one day" });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    let remaining = 0;

    if (planType === 'weekly') {
      end.setDate(end.getDate() + 7);
      remaining = 7;
    } else if (planType === 'monthly') {
      end.setDate(end.getDate() + 30);
      remaining = 30;
    } else {
      return res.status(400).json({ message: "Invalid planType. Must be 'weekly' or 'monthly'." });
    }

    const newSub = new Subscription({
      userId,
      chefId,
      planType,
      selectedDays: parsedDays,
      mealType: mealType || 'Lunch',
      startDate: start,
      endDate: end,
      remainingDays: remaining,
      totalCost: Number(totalCost),
      paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
      paymentStatus: 'pending',
      payoutStatus: 'none',
      status: 'pending'
    });

    await newSub.save();

    // Emit notification to admin
    try {
      const io = socketHelper.getIo();
      io.to('admin_room').emit('new_subscription', {
        message: `New manual subscription plan (${planType}) purchased! Awaiting payment approval.`
      });
    } catch (socketErr) {
      console.error("Socket emit failed on subscription add:", socketErr);
    }

    res.status(201).json({ message: "Subscription created and awaiting payment approval!", subscription: newSub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get User's Subscriptions (Active/All)
router.get('/:userId', async (req, res) => {
  try {
    const subs = await Subscription.find({ userId: req.params.userId })
      .populate('chefId', 'name specialty kitchenImage rating phone kitchenName about img')
      .sort({ createdAt: -1 });

    const subsWithOrders = await Promise.all(subs.map(async (sub) => {
      const orders = await Order.find({ subscriptionId: sub._id })
        .populate('rider', 'name phone')
        .populate('items.dishId', 'name img')
        .sort({ createdAt: -1 });
      return {
        ...sub.toObject(),
        orders
      };
    }));

    res.json(subsWithOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Pause/Resume Subscription
router.patch('/:id/pause', async (req, res) => {
  try {
    const { isPaused } = req.body;
    
    // In production, enforce 12 hours check before next delivery
    // e.g. checking current time against the next meal time.
    // For simplicity, we directly toggle isPaused and update status.
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    sub.isPaused = isPaused;
    sub.status = isPaused ? 'paused' : 'active';
    await sub.save();

    // Emit notification to Chef room
    try {
      const io = socketHelper.getIo();
      const subWithUser = await Subscription.findById(sub._id).populate('userId', 'name');
      const customerName = subWithUser.userId?.name || 'A customer';
      io.to(`chef_${sub.chefId}`).emit('new_order_notification', {
        status: isPaused ? 'paused' : 'active',
        message: `${customerName} has ${isPaused ? 'paused' : 'resumed'} their subscription.`
      });
    } catch (socketErr) {
      console.error("Socket emit failed on subscription pause/resume:", socketErr);
    }

    res.json({ message: `Subscription ${isPaused ? 'paused' : 'resumed'} successfully`, isPaused: sub.isPaused });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Paused Status for a Specific Delivery Day
router.patch('/:id/toggle-day', async (req, res) => {
  try {
    const { day } = req.body;
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    if (!sub.pausedDays) sub.pausedDays = [];

    if (sub.pausedDays.includes(day)) {
      // Resume day
      sub.pausedDays = sub.pausedDays.filter(d => d !== day);
    } else {
      // Pause day
      sub.pausedDays.push(day);
    }

    await sub.save();
    res.json({ message: `Delivery day '${day}' toggled successfully!`, pausedDays: sub.pausedDays, subscription: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Cancel Subscription
router.delete('/:id', async (req, res) => {
  try {
    const sub = await Subscription.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    res.json({ message: "Subscription cancelled successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Subscriptions for Chef
router.get('/chef/:chefId', async (req, res) => {
  try {
    const chefSubs = await Subscription.find({ chefId: req.params.chefId })
      .populate('userId', 'name email phone address')
      .sort({ createdAt: -1 });
    res.json(chefSubs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Create a new Subscription Plan (Chef only)
router.post('/plans', async (req, res) => {
  try {
    const { chefId, title, description, price, duration, mealType, menu } = req.body;
    const newPlan = new SubscriptionPlan({
      chefId,
      title,
      description,
      price: Number(price),
      duration,
      mealType: mealType || 'Breakfast',
      menu,
      isActive: true
    });
    await newPlan.save();
    res.status(201).json({ message: "Subscription plan created successfully!", plan: newPlan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get all active plans for a chef
router.get('/plans/chef/:chefId', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ chefId: req.params.chefId, isActive: true });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Get details of a single plan
router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Update subscription plan
router.put('/plans/:id', async (req, res) => {
  try {
    const { title, description, price, duration, mealType, menu, isActive } = req.body;
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (title !== undefined) plan.title = title;
    if (description !== undefined) plan.description = description;
    if (price !== undefined) plan.price = Number(price);
    if (duration !== undefined) plan.duration = duration;
    if (mealType !== undefined) plan.mealType = mealType;
    if (menu !== undefined) plan.menu = menu;
    if (isActive !== undefined) plan.isActive = isActive;

    await plan.save();
    res.json({ message: "Plan updated successfully!", plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Soft delete / deactivate plan
router.delete('/plans/:id', async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    plan.isActive = false;
    await plan.save();
    res.json({ message: "Plan deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Purchase/Subscribe to a pre-defined Plan
router.post('/subscribe-plan', upload.single('screenshot'), async (req, res) => {
  try {
    const { userId, planId, selectedDays, startDate, totalCost } = req.body;

    let parsedDays = selectedDays;
    if (typeof selectedDays === 'string') {
      try {
        parsedDays = JSON.parse(selectedDays);
      } catch (e) {
        parsedDays = selectedDays.split(',').map(d => d.trim());
      }
    }

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Subscription plan not found" });

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    let remaining = 0;

    if (plan.duration === 'weekly') {
      end.setDate(end.getDate() + 7);
      remaining = 7;
    } else if (plan.duration === '21days') {
      end.setDate(end.getDate() + 21);
      remaining = 21;
    } else if (plan.duration === 'monthly') {
      end.setDate(end.getDate() + 30);
      remaining = 30;
    } else {
      return res.status(400).json({ message: "Invalid duration in plan." });
    }

    const newSub = new Subscription({
      userId,
      chefId: plan.chefId,
      planType: plan.duration,
      selectedDays: parsedDays && parsedDays.length > 0 ? parsedDays : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      mealType: plan.mealType,
      startDate: start,
      endDate: end,
      remainingDays: remaining,
      totalCost: totalCost ? Number(totalCost) : plan.price,
      paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : '',
      paymentStatus: 'pending',
      payoutStatus: 'none',
      status: 'pending',
      planId: plan._id
    });

    await newSub.save();

    // Emit notification to admin
    try {
      const io = socketHelper.getIo();
      io.to('admin_room').emit('new_subscription', {
        message: `New package subscription (${plan.duration}) purchased! Awaiting payment approval.`
      });
    } catch (socketErr) {
      console.error("Socket emit failed on subscribe-plan:", socketErr);
    }

    res.status(201).json({ message: "Successfully subscribed! Awaiting payment verification by Admin.", subscription: newSub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Admin verifies payment screenshot (approve / reject)
// B3: Notify user on rejection; B4: Notify user + chef on approval
router.patch('/:id/verify-payment', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    const sub = await Subscription.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('chefId', 'name');
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    const io = socketHelper.getIo();

    // Extract socket room IDs safely before potentially modifying or saving the populated document
    const userIdStr = sub.userId && sub.userId._id ? sub.userId._id.toString() : (sub.userId ? sub.userId.toString() : '');
    const chefIdStr = sub.chefId && sub.chefId._id ? sub.chefId._id.toString() : (sub.chefId ? sub.chefId.toString() : '');
    const userName = sub.userId && sub.userId.name ? sub.userId.name : 'A customer';

    if (action === 'approve') {
      sub.paymentStatus = 'approved';
      sub.status = 'active';
      await sub.save();

      // B4: Notify user in real-time — subscription is now active
      if (userIdStr) {
        io.to(`user_${userIdStr}`).emit('payment_approved', {
          subscriptionId: sub._id,
          message: `✅ Your payment for the ${sub.planType} meal plan has been approved! Your subscription is now active.`
        });
      }
      // B4: Notify chef of new confirmed subscriber
      if (chefIdStr) {
        io.to(`chef_${chefIdStr}`).emit('new_order_notification', {
          status: 'subscription_approved',
          message: `💰 New subscriber confirmed! ${userName} has an active ${sub.planType} plan with you.`
        });
      }

    } else if (action === 'reject') {
      sub.paymentStatus = 'rejected';
      sub.status = 'payment_failed'; // B3: distinct failed state
      await sub.save();

      // B3: Notify user in real-time
      if (userIdStr) {
        io.to(`user_${userIdStr}`).emit('payment_rejected', {
          subscriptionId: sub._id,
          message: '❌ Your subscription payment was rejected. Please re-upload a valid payment screenshot from your profile.'
        });
      }

      // B3: Send rejection email to user
      if (sub.userId && sub.userId.email) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #e53e3e;">Subscription Payment Declined</h2>
            <p>Hello ${userName},</p>
            <p>Your payment proof for the <strong>${sub.planType}</strong> meal plan subscription has been reviewed and <strong>rejected</strong>.</p>
            <p>This may be due to an unclear screenshot, incorrect amount, or unverifiable details.</p>
            <p>Please log in to your HomePlates profile and re-upload a valid payment proof to re-activate your subscription.</p>
            <p>Regards,<br/>HomePlates Team</p>
          </div>
        `;
        await sendEmail(sub.userId.email, 'HomePlates — Subscription Payment Rejected', emailHtml).catch(() => {});
      }

    } else {
      return res.status(400).json({ message: "Invalid action. Use 'approve' or 'reject'." });
    }

    res.json({ message: `Subscription payment ${action}d successfully`, subscription: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Re-upload payment screenshot for a rejected subscription
router.patch('/:id/reupload-payment', upload.single('screenshot'), async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    if (!req.file) {
      return res.status(400).json({ message: "Please upload a screenshot" });
    }

    sub.paymentScreenshot = `/uploads/${req.file.filename}`;
    sub.paymentStatus = 'pending';
    sub.status = 'pending';
    await sub.save();

    // Emit notification to admin
    try {
      const io = socketHelper.getIo();
      io.to('admin_room').emit('new_subscription', {
        message: `A payment screenshot has been re-uploaded for a rejected subscription! Awaiting payment approval.`
      });
    } catch (socketErr) {
      console.error("Socket emit failed on subscription re-upload:", socketErr);
    }

    res.status(200).json({ message: "Screenshot re-uploaded successfully! Awaiting admin verification.", subscription: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 13. Admin approves chef payout for expired subscription
router.patch('/:id/approve-payout', authMiddleware, adminOnly, async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    if (sub.status !== 'expired') {
      return res.status(400).json({ message: "Subscription is not expired yet" });
    }
    if (sub.payoutStatus === 'paid') {
      return res.status(400).json({ message: "Payout already approved and processed" });
    }

    // Default 10% platform fee, chef gets 90%
    const payoutAmount = Math.round(sub.totalCost * 0.9);

    // Credit to chef wallet
    const chef = await User.findById(sub.chefId);
    if (!chef) return res.status(404).json({ message: "Chef not found" });

    chef.wallet += payoutAmount;
    await chef.save();

    sub.payoutStatus = 'paid';
    await sub.save();

    // Create WalletTransaction record
    await WalletTransaction.create({
      chefId: sub.chefId,
      type: 'credit',
      amount: payoutAmount,
      status: 'approved',
      paymentMethod: 'subscription_payout',
      accountDetails: `Payout for completed subscription ID: ${sub._id}`
    });

    res.json({ message: "Chef payout approved successfully", payoutAmount, subscription: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Admin lists pending payments
router.get('/admin/pending', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subs = await Subscription.find({ paymentStatus: 'pending' })
      .populate('userId', 'name email phone address')
      .populate('chefId', 'name specialty kitchenName about img')
      .sort({ createdAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Admin lists pending payouts
router.get('/admin/payouts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subs = await Subscription.find({ status: 'expired', payoutStatus: 'pending' })
      .populate('userId', 'name email phone')
      .populate('chefId', 'name specialty wallet kitchenName about img')
      .sort({ updatedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
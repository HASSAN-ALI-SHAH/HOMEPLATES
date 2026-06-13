const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const WalletTransaction = require('../models/WalletTransaction');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/mailer');
const authMiddleware = require('../middleware/auth');

// Helper to check if role is admin
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: "Access Denied: Admins Only" });
  }
};

// ----------------------------------------------------
// 1. Chef Verification
// ----------------------------------------------------

// Get pending chef verifications (used in AdminDashboard.jsx)
router.get('/chefs/pending', authMiddleware, adminOnly, async (req, res) => {
  try {
    const pendingChefs = await User.find({ 
      role: 'chef', 
      verificationStatus: 'pending' 
    }).select('-password');
    res.json(pendingChefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify Chef Account (Approve / Reject)
router.put('/verify-chef/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'approve' | 'reject'
    const status = action === 'approve' ? 'verified' : 'rejected';
    const isVerified = action === 'approve';

    const chef = await User.findByIdAndUpdate(
      req.params.id, 
      { isVerified, verificationStatus: status }, 
      { new: true }
    );

    if (!chef) return res.status(404).json({ message: "Chef not found" });

    // Send notification email
    const subject = action === 'approve' ? "Your HomePlates Account is Active!" : "HomePlates — Re-upload Documents Required";
    const emailHtml = action === 'approve' 
      ? `<h2>Congratulations Chef ${chef.name}!</h2><p>Your HomePlates kitchen account has been verified and activated. You can now log in and add dishes to your menu.</p>`
      : `<h2>Kitchen Account Update</h2><p>Unfortunately, your verification was rejected. Reason: <strong>${reason || 'Document mismatch'}</strong>. Please re-upload clear documents on your dashboard.</p>`;
    
    await sendEmail(chef.email, subject, emailHtml);

    res.json({ message: `Chef ${action === 'approve' ? 'Approved' : 'Rejected'} successfully!`, chef });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. User & Chef Management
// ----------------------------------------------------

// Get Users with filters and pagination
router.get('/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    let query = {};

    if (role) query.role = role;
    if (status) query.isActive = status === 'active';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skipIndex = (page - 1) * limit;
    const users = await User.find(query)
      .select('-password')
      .skip(skipIndex)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed User profile
router.get('/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });

    const orderCount = await Order.countDocuments({ user: req.params.id });
    const chefOrderCount = await Order.countDocuments({ chef: req.params.id });

    res.json({ 
      user, 
      ordersCount: user.role === 'chef' ? chefOrderCount : orderCount 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Block/Unblock User status
router.patch('/users/:id/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action } = req.body; // action: 'block' | 'unblock' | 'suspend'
    const isActive = action === 'unblock';
    
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: `User status changed to ${isActive ? 'active' : 'inactive'}`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. Analytics
// ----------------------------------------------------

// Get Dashboard Aggregated Analytics
router.get('/analytics', authMiddleware, adminOnly, async (req, res) => {
  try {
    const range = Number(req.query.range) || 30; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - range);

    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalChefs = await User.countDocuments({ role: 'chef' });
    const totalOrders = await Order.countDocuments();
    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });

    // Aggregate total revenue (sum of delivered order amounts)
    const revenueAgg = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Revenue by day aggregation
    const revenueByDay = await Order.aggregate([
      { $match: { status: 'delivered', orderDate: { $gte: startDate } } },
      { $group: { 
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } },
          amount: { $sum: "$totalAmount" }, 
          orderCount: { $sum: 1 } 
        } 
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', amount: 1, _id: 0 } }
    ]);

    // Top Chefs aggregation (by delivered orders)
    const topChefs = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { 
          _id: '$chef', 
          orders: { $sum: 1 }, 
          earnings: { $sum: { $multiply: ['$totalAmount', 0.9] } } // 90% after platform fee
        } 
      },
      { $sort: { orders: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'chefDetails'
        }
      },
      { $unwind: '$chefDetails' },
      { $project: {
          name: '$chefDetails.name',
          orders: 1,
          earnings: 1
        }
      }
    ]);

    res.json({
      totalUsers,
      totalChefs,
      totalOrders,
      totalRevenue,
      activeSubscriptions,
      revenueByDay,
      topChefs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. Withdrawal Request Management
// ----------------------------------------------------

// Get withdrawals (used by admin wallet overview)
router.get('/withdrawals', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const withdrawals = await WalletTransaction.find({ type: 'debit', status })
      .populate('chefId', 'name email phone wallet kitchenName about img')
      .sort({ createdAt: -1 });

    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process Withdrawal (Approve / Reject)
router.patch('/withdrawals/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action } = req.body; // action: 'approve' | 'reject'
    const transaction = await WalletTransaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: "Withdrawal transaction not found" });
    if (transaction.status !== 'pending') {
      return res.status(400).json({ message: "Transaction already processed" });
    }

    const chef = await User.findById(transaction.chefId);
    if (!chef) return res.status(404).json({ message: "Chef not found" });

    transaction.status = action === 'approve' ? 'approved' : 'rejected';
    transaction.processedBy = req.user.id;
    await transaction.save();

    if (action === 'approve') {
      // Amount is already deducted from wallet at request time.
      // So we just clear/reduce it from pendingBalance (approved debit is processed).
      chef.pendingBalance = Math.max(0, chef.pendingBalance - transaction.amount);
      await chef.save();

      // Send confirmation email
      const emailHtml = `<h2>Payment Processed!</h2><p>Your withdrawal request for Rs. ${transaction.amount} via ${transaction.paymentMethod} has been approved and processed.</p>`;
      await sendEmail(chef.email, `Payment Processed — Rs. ${transaction.amount}`, emailHtml);

    } else if (action === 'reject') {
      // Refund pending balance back to wallet
      chef.wallet += transaction.amount;
      chef.pendingBalance = Math.max(0, chef.pendingBalance - transaction.amount);
      await chef.save();

      // Send rejection email
      const emailHtml = `<h2>Withdrawal Rejected</h2><p>Your withdrawal request for Rs. ${transaction.amount} has been rejected. The amount has been refunded to your wallet balance.</p>`;
      await sendEmail(chef.email, "HomePlates — Withdrawal Request Rejected", emailHtml);
    }

    res.json({ message: `Withdrawal request ${transaction.status} successfully`, transaction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. Governance Settings
// ----------------------------------------------------

// Get settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings
router.put('/settings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { platformFee, minimumWithdrawal, deliveryRadius, termsOfService } = req.body;
    
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings({});

    if (platformFee !== undefined) {
      if (platformFee < 1 || platformFee > 50) {
        return res.status(400).json({ message: "Platform fee must be between 1% and 50%" });
      }
      settings.platformFee = platformFee;
    }
    if (minimumWithdrawal !== undefined) settings.minimumWithdrawal = minimumWithdrawal;
    if (deliveryRadius !== undefined) settings.deliveryRadius = deliveryRadius;
    if (termsOfService !== undefined) settings.termsOfService = termsOfService;

    await settings.save();
    res.json({ message: "Platform settings updated successfully", settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all active subscriptions
router.get('/subscriptions/active', authMiddleware, adminOnly, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ 
      status: { $in: ['active', 'paused', 'pending'] } 
    })
    .populate('userId', 'name email phone address')
    .populate('chefId', 'name specialty kitchenName about img')
    .sort({ createdAt: -1 });
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all subscription daily delivery orders
router.get('/daily-deliveries', authMiddleware, adminOnly, async (req, res) => {
  try {
    const deliveries = await Order.find({ isSubscriptionOrder: true })
      .populate('user', 'name phone address')
      .populate('chef', 'name specialty phone kitchenName about img')
      .populate('rider', 'name phone')
      .sort({ orderDate: -1 });
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
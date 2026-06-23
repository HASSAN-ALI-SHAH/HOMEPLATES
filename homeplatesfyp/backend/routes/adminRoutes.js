const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const WalletTransaction = require('../models/WalletTransaction');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/mailer');
const authMiddleware = require('../middleware/auth');
const socketHelper = require('../socket');

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
      { 
        isVerified, 
        verificationStatus: status,
        rejectionReason: action === 'reject' ? (reason || 'Document mismatch') : undefined
      }, 
      { new: true }
    );

    if (!chef) return res.status(404).json({ message: "Chef not found" });

    // Send notification email
    const subject = action === 'approve' ? "Your HomePlates Account is Active!" : "HomePlates — Re-upload Documents Required";
    const emailHtml = action === 'approve' 
      ? `<h2>Congratulations Chef ${chef.name}!</h2><p>Your HomePlates kitchen account has been verified and activated. You can now log in and add dishes to your menu.</p>`
      : `<h2>Kitchen Account Update</h2><p>Unfortunately, your verification was rejected. Reason: <strong>${reason || 'Document mismatch'}</strong>. Please re-upload clear documents on your dashboard.</p>`;
    
    await sendEmail(chef.email, subject, emailHtml);

    // ── Real-time in-app notification to the chef ──
    try {
      const io = socketHelper.getIo();
      if (action === 'approve') {
        io.to(`chef_${chef._id}`).emit('account_status_update', {
          status: 'approved',
          message: '🎉 Congratulations! Your HomePlates chef account has been approved. You can now go online and start accepting orders!'
        });
      } else {
        io.to(`chef_${chef._id}`).emit('account_status_update', {
          status: 'rejected',
          message: `❌ Your chef application was rejected. Reason: ${req.body.reason || 'Document mismatch'}. Please re-upload your documents from the dashboard.`
        });
      }
    } catch (socketErr) {
      console.error('Socket emit failed on chef verification:', socketErr);
    }

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
// B5/B6: Emit socket notification to chef with updated balance
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

    let newBalance = chef.wallet;

    if (action === 'approve') {
      // Amount already deducted from wallet at request time
      chef.pendingBalance = Math.max(0, chef.pendingBalance - transaction.amount);
      await chef.save();
      newBalance = chef.wallet;

      const emailHtml = `<h2>Payment Processed!</h2><p>Your withdrawal request for Rs. ${transaction.amount} via ${transaction.paymentMethod} has been approved and processed.</p>`;
      await sendEmail(chef.email, `Payment Processed — Rs. ${transaction.amount}`, emailHtml);

      // B5: Notify chef in real-time of approval
      try {
        const io = socketHelper.getIo();
        io.to(`chef_${chef._id}`).emit('withdrawal_update', {
          action: 'approved',
          amount: transaction.amount,
          newBalance,
          message: `✅ Your withdrawal of PKR ${transaction.amount} has been approved and processed!`
        });
      } catch (_) {}

    } else if (action === 'reject') {
      // Refund pending balance back to wallet
      chef.wallet += transaction.amount;
      chef.pendingBalance = Math.max(0, chef.pendingBalance - transaction.amount);
      await chef.save();
      newBalance = chef.wallet;

      const emailHtml = `<h2>Withdrawal Rejected</h2><p>Your withdrawal request for Rs. ${transaction.amount} has been rejected. The amount has been refunded to your wallet balance.</p>`;
      await sendEmail(chef.email, "HomePlates — Withdrawal Request Rejected", emailHtml);

      // B5/B6: Notify chef in real-time of rejection + send updated balance so frontend updates immediately
      try {
        const io = socketHelper.getIo();
        io.to(`chef_${chef._id}`).emit('withdrawal_update', {
          action: 'rejected',
          amount: transaction.amount,
          newBalance,
          message: `❌ Your withdrawal of PKR ${transaction.amount} was rejected. The amount has been refunded to your wallet.`
        });
      } catch (_) {}
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

// Get Rider Monitoring Data
// B2: Accept ?verified=true|false|all query param
router.get('/riders', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { verified } = req.query;
    let riderQuery = { role: 'rider' };
    if (verified === 'true') riderQuery.isVerified = true;
    else if (verified === 'false') riderQuery.isVerified = false;
    // 'all' or omitted = no filter

    const riders = await User.find(riderQuery).select('-password');
    const riderLogs = [];

    for (let rider of riders) {
      const assignedOrders = await Order.find({
        rider: rider._id,
        status: { $nin: ['delivered', 'cancelled', 'delivery-failed', 'rider_cancelled'] }
      }).populate('user chef');

      const acceptedOrders = await Order.find({ rider: rider._id }).populate('user chef');

      const ignoredOrders = await Order.find({ ignoredBy: rider._id }).populate('user chef');

      const statusHistoryOrders = await Order.find({
        'statusHistory.updatedBy': rider._id
      }).populate('user chef');

      const historyLog = [];
      for (let order of statusHistoryOrders) {
        for (let history of order.statusHistory) {
          if (history.updatedBy && history.updatedBy.toString() === rider._id.toString()) {
            historyLog.push({
              orderId: order._id,
              status: history.status,
              timestamp: history.timestamp,
              chefName: order.chef?.name,
              customerName: order.user?.name
            });
          }
        }
      }
      historyLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      riderLogs.push({
        rider: {
          _id: rider._id,
          name: rider.name,
          email: rider.email,
          phone: rider.phone,
          city: rider.city || 'Lahore',
          isActive: rider.isActive,
          isVerified: rider.isVerified,
          vehicle: rider.vehicle || 'Not specified'
        },
        assignedOrders,
        acceptedOrders,
        ignoredOrders,
        historyLog
      });
    }

    res.json(riderLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 6. Help & Support Management (Admin)
// ----------------------------------------------------

const SupportTicket = require('../models/SupportTicket');

// Get all support tickets (with optional status filter)
router.get('/support', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const tickets = await SupportTicket.find(query).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reply to a ticket and optionally mark as resolved
router.patch('/support/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { adminReply, status } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    if (adminReply !== undefined) ticket.adminReply = adminReply;
    if (status && ['open', 'in-progress', 'resolved'].includes(status)) ticket.status = status;
    if (adminReply) {
      ticket.repliedAt = new Date();
      // Send notification email to the user
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #1A2316;">HomePlates Support Ticket Response</h2>
            <p>Hello ${ticket.name},</p>
            <p>Our support team has responded to your inquiry:</p>
            <div style="background-color: #f7f9f6; padding: 15px; border-left: 4px solid #FBBF24; margin: 15px 0;">
              <strong>Your Query:</strong><br/>
              <p style="margin-top: 5px; color: #555;">${ticket.message}</p>
            </div>
            <div style="background-color: #f0f4f1; padding: 15px; border-left: 4px solid #1A2316; margin: 15px 0;">
              <strong>Admin Response:</strong><br/>
              <p style="margin-top: 5px; color: #1A2316; font-weight: bold;">${adminReply}</p>
            </div>
            <p>Regards,<br/>HomePlates Support Team</p>
          </div>
        `;
        await sendEmail(ticket.email, `HomePlates Support: Response to "${ticket.subject}"`, emailHtml);
      } catch (emailErr) {
        console.error("Failed to send support response email:", emailErr.message);
      }
    }

    await ticket.save();
    res.json({ message: 'Ticket updated successfully', ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW RIDER VERIFICATION & WITHDRAWALS ---
const Notification = require('../models/Notification');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + path.extname(file.originalname))
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// GET Admin Notifications
router.get('/notifications', authMiddleware, adminOnly, async (req, res) => {
  try {
    const list = await Notification.find({ recipientRole: 'admin' })
      .sort({ isRead: 1, createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark Admin Notification Read
router.patch('/notifications/:id/read', authMiddleware, adminOnly, async (req, res) => {
  try {
    const noti = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    res.json(noti);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Riders List with status filters (All / Pending / Verified / Rejected)
router.get('/riders/list', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status } = req.query; // 'pending' | 'verified' | 'rejected' or empty
    let query = { role: 'rider' };
    if (status && ['pending', 'verified', 'rejected'].includes(status)) {
      query.verificationStatus = status;
    }
    const riders = await User.find(query).select('-password').sort({ createdAt: -1 });
    res.json(riders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify Rider Account (Approve / Reject)
router.put('/verify-rider/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'approve' | 'reject'
    const status = action === 'approve' ? 'verified' : 'rejected';
    const isVerified = action === 'approve';

    const rider = await User.findByIdAndUpdate(
      req.params.id,
      {
        isVerified,
        verificationStatus: status,
        rejectionReason: action === 'reject' ? (reason || 'Document mismatch') : null,
        verificationReviewedAt: new Date(),
        verificationReviewedBy: req.user.id
      },
      { new: true }
    );

    if (!rider) return res.status(404).json({ message: "Rider not found" });

    // Send notification email
    const subject = action === 'approve' ? "Your HomePlates Rider Account is Active!" : "HomePlates — Rider Verification Rejected";
    const emailHtml = action === 'approve'
      ? `<h2>Welcome Rider ${rider.name}!</h2><p>Your HomePlates rider account has been verified and activated. You can now log in, go online, and accept orders.</p>`
      : `<h2>Rider Account Update</h2><p>Unfortunately, your verification was rejected. Reason: <strong>${reason || 'Document mismatch'}</strong>. Please edit/update your profile on your dashboard to re-submit.</p>`;
    
    await sendEmail(rider.email, subject, emailHtml).catch(() => {});

    // Emit Socket event to Rider
    try {
      const io = socketHelper.getIo();
      io.to(`rider_${rider._id}`).emit('verificationUpdate', { status, rejectionReason: action === 'reject' ? reason : null });
      io.to(rider._id.toString()).emit('verificationUpdate', { status, rejectionReason: action === 'reject' ? reason : null });
    } catch (_) {}

    res.json({ message: `Rider ${action === 'approve' ? 'Approved' : 'Rejected'} successfully!`, rider });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Rider Withdrawal Requests
router.get('/rider/withdrawals', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status } = req.query; // 'pending' | 'approved' | 'rejected' | 'paid' or empty
    let query = {};
    if (status) query.status = status;
    const requests = await WithdrawalRequest.find(query)
      .populate('rider', 'name email phone wallet')
      .sort({ requestedAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve/Reject Rider Withdrawal Request (Phase 1)
router.patch('/rider/withdrawals/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action, adminNote } = req.body; // action: 'approve' | 'reject'
    const request = await WithdrawalRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Withdrawal request not found" });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: "Request has already been processed" });
    }

    request.status = action === 'approve' ? 'approved' : 'rejected';
    if (adminNote) request.adminNote = adminNote;
    request.processedBy = req.user.id;
    await request.save();

    // Emit Socket event to Rider
    try {
      const io = socketHelper.getIo();
      io.to(`rider_${request.rider}`).emit('withdrawalStatusUpdate', { requestId: request._id, status: request.status });
      io.to(request.rider.toString()).emit('withdrawalStatusUpdate', { requestId: request._id, status: request.status });
    } catch (_) {}

    res.json({ message: `Withdrawal request ${request.status} successfully`, request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Proof & Pay Rider Withdrawal Request (Phase 2)
router.patch('/rider/withdrawals/:id/pay', authMiddleware, adminOnly, upload.single('proof'), async (req, res) => {
  try {
    const request = await WithdrawalRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Withdrawal request not found" });
    if (request.status !== 'approved') {
      return res.status(400).json({ message: "Request must be approved first before marking as paid" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Payment proof image is required" });
    }

    const rider = await User.findById(request.rider);
    if (!rider) return res.status(404).json({ message: "Rider not found" });

    if (rider.wallet < request.amount) {
      return res.status(400).json({ message: "Rider has insufficient wallet balance to complete this transaction" });
    }

    // Deduct from wallet now
    rider.wallet -= request.amount;
    await rider.save();

    // Update request
    request.status = 'paid';
    request.proofImage = `/uploads/${req.file.filename}`;
    request.processedAt = new Date();
    request.processedBy = req.user.id;
    await request.save();

    // Also create a WalletTransaction record to keep transaction history complete
    await WalletTransaction.create({
      chefId: request.rider, // using chefId field for rider to reuse model
      type: 'debit',
      amount: request.amount,
      status: 'approved',
      processedBy: req.user.id,
      accountDetails: `Withdrawal Paid: Request #${request._id.toString().slice(-6)}`
    });

    // Emit Socket event to Rider
    try {
      const io = socketHelper.getIo();
      io.to(`rider_${request.rider}`).emit('withdrawalStatusUpdate', { 
        requestId: request._id, 
        status: 'paid', 
        proofImage: request.proofImage 
      });
      io.to(request.rider.toString()).emit('withdrawalStatusUpdate', { 
        requestId: request._id, 
        status: 'paid', 
        proofImage: request.proofImage 
      });
    } catch (_) {}

    res.json({ message: "Withdrawal marked as paid, proof uploaded, and balance deducted successfully", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
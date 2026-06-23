const express = require('express');
const router = express.Router();
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const authMiddleware = require('../middleware/auth');
const socketHelper = require('../socket');

// Get wallet summary for a chef
router.get('/:chefId', authMiddleware, async (req, res) => {
  try {
    const chef = await User.findById(req.params.chefId);
    if (!chef) return res.status(404).json({ message: "Chef not found" });

    const transactions = await WalletTransaction.find({ chefId: req.params.chefId })
      .sort({ createdAt: -1 });

    const approvedWithdrawals = await WalletTransaction.find({ 
      chefId: req.params.chefId, 
      type: 'debit', 
      status: 'approved' 
    });
    const withdrawnTotal = approvedWithdrawals.reduce((sum, tx) => sum + tx.amount, 0);

    res.json({
      totalBalance: chef.wallet,
      pendingBalance: chef.pendingBalance,
      withdrawnTotal,
      transactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request withdrawal
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { chefId, amount, paymentMethod, accountDetails } = req.body;

    if (chefId !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized wallet access" });
    }

    const withdrawAmount = Number(amount);
    if (withdrawAmount < 1000) {
      return res.status(400).json({ message: "Minimum withdrawal is Rs. 1000" });
    }

    const chef = await User.findById(chefId);
    if (chef.wallet < withdrawAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    chef.wallet -= withdrawAmount;
    chef.pendingBalance += withdrawAmount;
    await chef.save();

    const request = new WalletTransaction({
      chefId,
      type: 'debit',
      amount: withdrawAmount,
      paymentMethod,
      accountDetails,
      status: 'pending'
    });

    await request.save();

    // Emit notification to admin
    try {
      const io = socketHelper.getIo();
      io.to('admin_room').emit('new_withdrawal_request', {
        message: `New withdrawal request of PKR ${withdrawAmount} submitted by Chef ${chef.name}.`
      });
    } catch (socketErr) {
      console.error("Socket emit failed on withdrawal request:", socketErr);
    }

    res.status(201).json({ message: "Withdrawal request submitted successfully", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW RIDER WITHDRAWAL REQUESTS ---
const WithdrawalRequest = require('../models/WithdrawalRequest');
const Notification = require('../models/Notification');

// Request withdrawal (Rider)
router.post('/rider/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const riderId = req.user.id;

    if (req.user.role !== 'rider') {
      return res.status(403).json({ message: "Only riders can request rider withdrawals" });
    }

    const withdrawAmount = Number(amount);
    if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount < 1000) {
      return res.status(400).json({ message: "Minimum withdrawal is Rs. 1000" });
    }

    const rider = await User.findById(riderId);
    if (!rider) return res.status(404).json({ message: "Rider not found" });

    if (rider.wallet < withdrawAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Check if duplicate requests exist (status pending or approved)
    const existingRequest = await WithdrawalRequest.findOne({
      rider: riderId,
      status: { $in: ['pending', 'approved'] }
    });

    if (existingRequest) {
      return res.status(400).json({ message: "You already have a pending or approved withdrawal request. Wait for it to be processed." });
    }

    const request = new WithdrawalRequest({
      rider: riderId,
      amount: withdrawAmount
    });
    await request.save();

    // Create Admin notification
    const notification = new Notification({
      recipientRole: 'admin',
      type: 'withdrawal_request',
      referenceId: request._id,
      message: `New withdrawal request of Rs. ${withdrawAmount} submitted by rider ${rider.name}.`
    });
    await notification.save();

    // Emit Socket notification to Admin
    try {
      const io = socketHelper.getIo();
      io.to('admin_room').emit('newWithdrawalRequest', {
        requestId: request._id,
        riderId,
        amount: withdrawAmount,
        message: `New withdrawal request of Rs. ${withdrawAmount} submitted by rider ${rider.name}.`
      });
    } catch (_) {}

    res.status(201).json({ message: "Withdrawal request submitted successfully", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET withdrawal requests history (Rider)
router.get('/rider/withdrawals', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'rider') {
      return res.status(403).json({ message: "Only riders can access rider withdrawals" });
    }
    const history = await WithdrawalRequest.find({ rider: req.user.id })
      .sort({ requestedAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

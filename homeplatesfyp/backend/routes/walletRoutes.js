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

    res.status(201).json({ message: "Withdrawal request submitted", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

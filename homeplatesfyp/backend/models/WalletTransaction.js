const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    chefId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true }, // credit = earnings, debit = withdrawal
    amount: { type: Number, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    paymentMethod: { type: String }, // e.g. "EasyPaisa", "JazzCash", "Bank Transfer"
    accountDetails: { type: String }, // Account number / IBAN
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Admin reference
}, { timestamps: true });

module.exports = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTransactionSchema);

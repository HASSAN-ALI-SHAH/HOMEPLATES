const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // must be >= Rs. 1,000 minimum
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid'],
    default: 'pending'
  },
  proofImage: { type: String, default: null }, // uploaded by admin after payment
  adminNote: { type: String, default: null }, // optional reason for rejection or note on approval
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } // admin who reviewed it
}, { timestamps: true });

module.exports = mongoose.models.WithdrawalRequest || mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

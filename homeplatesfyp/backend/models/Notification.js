const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientRole: { type: String, enum: ['admin'], default: 'admin' },
  type: { type: String, enum: ['rider_pending', 'withdrawal_request'] },
  referenceId: { type: mongoose.Schema.Types.ObjectId, required: true }, // riderId or withdrawalRequestId
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

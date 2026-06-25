const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientRole: { type: String, default: 'admin' },
  recipientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:          { type: String, enum: ['rider_pending', 'withdrawal_request', 'support_resolved'] },
  referenceId:   { type: mongoose.Schema.Types.ObjectId, required: true }, // riderId, withdrawalRequestId, or ticketId
  message:       { type: String, required: true },
  isRead:        { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

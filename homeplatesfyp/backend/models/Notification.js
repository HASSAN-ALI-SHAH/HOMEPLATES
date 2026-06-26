const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientRole: { type: String, default: 'admin' },
  recipientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:          { type: String }, // e.g. 'rider_pending', 'chef_pending', 'withdrawal_request', etc.
  title:         { type: String },
  referenceId:   { type: mongoose.Schema.Types.ObjectId, required: false },
  message:       { type: String, required: true },
  isRead:        { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

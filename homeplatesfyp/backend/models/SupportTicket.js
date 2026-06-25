const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  email:         { type: String, required: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subject:       { type: String, required: true },
  message:       { type: String, required: true },
  status:        { type: String, enum: ['open', 'in-progress', 'resolved', 'pending'], default: 'pending' },
  adminReply:    { type: String, default: '' },
  repliedAt:     { type: Date },
  adminResponse: { type: String, default: null },
  respondedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  respondedAt:   { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

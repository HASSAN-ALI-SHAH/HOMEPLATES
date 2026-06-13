const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  platformFee: { type: Number, default: 10, min: 1, max: 50 },
  minimumWithdrawal: { type: Number, default: 1000 },
  deliveryRadius: { type: Number, default: 15 },
  termsOfService: { type: String, default: "Welcome to HomePlates. Please use responsibly." }
}, { timestamps: true });

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

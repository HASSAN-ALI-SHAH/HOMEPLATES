const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chefId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planType: { type: String, enum: ['weekly', 'monthly', '21days'], required: true },
    selectedDays: [{ type: String, required: true }], // e.g. ["Monday", "Wednesday", "Friday"]
    pausedDays: [{ type: String }], // e.g. ["Monday"]
    mealType: { type: String, default: 'Lunch' }, // "Lunch" or "Dinner"
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    remainingDays: { type: Number, required: true },
    deliveredDays: { type: Number, default: 0 },
    totalCost: { type: Number },
    isPaused: { type: Boolean, default: false },
    // B3: added 'payment_failed' to status enum
    status: { type: String, enum: ['pending', 'active', 'expired', 'paused', 'payment_failed'], default: 'pending' },
    paymentScreenshot: { type: String },
    paymentStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    payoutStatus: { type: String, enum: ['none', 'pending', 'paid'], default: 'none' },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' }
}, { timestamps: true });

module.exports = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
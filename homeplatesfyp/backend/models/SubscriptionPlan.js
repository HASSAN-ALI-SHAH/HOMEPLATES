const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  chefId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: String, enum: ['weekly', 'monthly', '21days'], required: true },
  mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Dinner', 'All Meals'], default: 'Breakfast' },
  menu: [{
    day: { type: String, required: true },
    items: { type: String, required: true }
  }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

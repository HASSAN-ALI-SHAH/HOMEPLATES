const mealPlanSchema = new mongoose.Schema({
    chef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    planName: String,
    isActive: { type: Boolean, default: true }
});
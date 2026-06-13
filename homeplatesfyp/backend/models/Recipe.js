const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
    chefId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    name: { type: String, required: true },
    time: { type: String }, // e.g. "15 mins"
    difficulty: { type: String, default: 'Easy' }, // e.g. "Easy", "Medium", "Hard"
    img: { type: String }, // path to uploaded recipe image
    ingredients: [{ type: String }],
    steps: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.models.Recipe || mongoose.model('Recipe', recipeSchema);

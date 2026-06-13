const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    chef: { type: String, required: true }, // Display name of chef
    chefId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    prepTime: { type: String }, // e.g. "45 mins"
    img: { type: String }, // Cloudinary or local path
    tag: { type: String, default: 'Popular' },
    distance: { type: Number, default: 0 },
    time: { type: String }, // Estimated delivery time
    isAvailable: { type: Boolean, default: true },
    
    // Pricing Calculator
    pricingDetails: {
        rawMaterials: { type: Number },
        packaging: { type: Number },
        gasElectric: { type: Number },
        profit: { type: Number },
        margin: { type: Number }
    }
}, { timestamps: true });

module.exports = mongoose.models.Menu || mongoose.model('Menu', menuSchema);
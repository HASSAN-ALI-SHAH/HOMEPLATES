const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    items: [{
        dishId: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }, // Snapshot at order time
        portion: { type: String, default: 'Full' }
    }],
    
    totalAmount: { type: Number, required: true },
    deliveryAddress: { type: String },
    deliveryCharges: { type: Number, default: 150 },
    paymentMethod: { type: String, enum: ['cash', 'wallet'], default: 'cash' },
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'preparing', 'ready-for-pickup', 'picked-up', 'out-for-delivery', 'delivered', 'cancelled'], 
        default: 'pending' 
    },
    
    currentLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    
    isSubscriptionOrder: { type: Boolean, default: false },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    cancellationReason: { type: String },
    orderDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
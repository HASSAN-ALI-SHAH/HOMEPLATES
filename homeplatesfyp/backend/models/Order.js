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
        enum: [
            'pending', 'accepted', 'preparing', 'ready-for-pickup',
            'picked-up', 'out-for-delivery', 'delivered',
            'cancelled', 'delivery-failed', 'rider_cancelled'
        ], 
        default: 'pending' 
    },
    
    currentLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },

    // Stored at order-placement time — used directly by map components, no geocoding
    pickupLocation: {       // chef's kitchen GPS (copied from chef.location)
        lat: { type: Number },
        lng: { type: Number }
    },
    deliveryLocation: {     // customer's GPS (sent by browser at checkout)
        lat: { type: Number },
        lng: { type: Number }
    },
    
    isSubscriptionOrder: { type: Boolean, default: false },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    cancellationReason: { type: String },
    failureReason: { type: String },            // B8/B9: reason rider failed delivery
    orderDate: { type: Date, default: Date.now },

    ignoredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    statusHistory: [{
        status: { type: String, required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
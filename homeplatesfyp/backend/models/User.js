const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'chef', 'rider', 'admin'], default: 'user' },
    
    // Profile Fields
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    
    // Chef / Rider Specific
    specialty: { type: String },
    experience: { type: String },
    cnic: { type: String },
    kitchenImage: { type: String }, // Cloudinary URL
    img: { type: String }, // Profile picture
    kitchenName: { type: String },
    about: { type: String },
    vehicle: { type: String },
    zone: { type: String },
    
    // Rating Aggregates
    rating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    
    // Verification & Status
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    rejectionReason: { type: String },
    verificationReviewedAt: { type: Date, default: null },
    verificationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    
    // Financial (Chef only)
    wallet: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    
    // Live Tracking
    location: {
        lat: { type: Number },
        lng: { type: Number }
    },

    // OTP Verification
    otpCode: { type: String },
    otpExpires: { type: Date },
    isEmailVerified: { type: Boolean, default: false },

    // Custom Subscription Pricing (Chef only)
    weeklyBreakfastPrice: { type: Number },
    weeklyLunchPrice: { type: Number },
    weeklyDinnerPrice: { type: Number },
    monthlyBreakfastPrice: { type: Number },
    monthlyLunchPrice: { type: Number },
    monthlyDinnerPrice: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
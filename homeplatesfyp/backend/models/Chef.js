// models/Chef.js
const mongoose = require('mongoose');

const chefSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User ID se connect
    city: String,
    specialty: String,
    experience: String,
    rating: { type: Number, default: 0 },
    img: String
});

module.exports = mongoose.model('Chef', chefSchema);
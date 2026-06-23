const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Apne Compass ka connection string yahan paste karein
        // Default local URL: mongodb://localhost:27017/HomePlates
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/HomePlates');
        console.log("MongoDB Connected Successfully!");
    } catch (err) {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
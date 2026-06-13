const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const path = require('path');
// Load .env from the backend root regardless of which directory the script is run from
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Settings = require('../models/Settings');


const seed = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/HomePlates';
    await mongoose.connect(mongoUri);
    console.log("Connected to database for seeding.");

    // Delete existing admin if exists to avoid duplicates
    await User.deleteMany({ email: "admin@homeplates.pk" });
    
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const admin = new User({
      name: "Master Admin",
      email: "admin@homeplates.pk",
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      isActive: true,
      isEmailVerified: true
    });
    
    await admin.save();
    console.log("✅ Admin user seeded: admin@homeplates.pk / admin123");

    // Seed default settings if not exists
    const settingsCount = await Settings.countDocuments();
    if (settingsCount === 0) {
      const defaultSettings = new Settings({
        platformFee: 10,
        minimumWithdrawal: 1000,
        deliveryRadius: 15,
        termsOfService: "Welcome to HomePlates. Please use responsibly."
      });
      await defaultSettings.save();
      console.log("✅ Default platform settings seeded!");
    }

    await mongoose.connection.close();
    console.log("Seeding complete. Connection closed.");
  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  }
};

seed();

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/mailer');

// HELPER: Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Signup Route
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role, phone, cnic, city } = req.body;
    
    if (!city || !['Lahore', 'Karachi', 'Islamabad'].includes(city)) {
      return res.status(400).json({ message: "City is required and must be Lahore, Karachi, or Islamabad" });
    }
    
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'user',
      phone,
      cnic,
      city,
      otpCode: otp,
      otpExpires,
      isEmailVerified: false,
      // Default verification values
      isVerified: (role === 'user' || role === 'admin'), // Users and Admin are verified directly, chefs/riders need admin approval
      verificationStatus: (role === 'chef' || role === 'rider') ? 'pending' : 'verified'
    });

    await newUser.save();

    // Create Admin notification and emit socket event for Rider signup
    if (role === 'rider') {
      try {
        const Notification = require('../models/Notification');
        const socketHelper = require('../socket');
        
        const newNotification = new Notification({
          recipientRole: 'admin',
          type: 'rider_pending',
          referenceId: newUser._id,
          message: `New rider registered: ${name}`
        });
        await newNotification.save();

        const io = socketHelper.getIo();
        io.to('admin_room').emit('newRiderPending', {
          riderId: newUser._id,
          name: newUser.name,
          vehicleType: 'Motorcycle',
          createdAt: newUser.createdAt
        });
      } catch (err) {
        console.error("Error creating rider pending notification/socket event:", err);
      }
    }

    // Send OTP Email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #1A2316;">Welcome to HomePlates!</h2>
        <p>Thank you for registering. Please verify your email by entering the following OTP code:</p>
        <div style="font-size: 24px; font-weight: bold; background-color: #f7f7f7; padding: 10px; width: fit-content; border-radius: 5px; color: #FBBF24; letter-spacing: 2px;">
          ${otp}
        </div>
        <p>This OTP is valid for 10 minutes.</p>
        <p>Regards,<br/>HomePlates Team</p>
      </div>
    `;
    await sendEmail(email, "HomePlates — Email Verification OTP", emailHtml);

    res.status(201).json({ 
      message: "User created! OTP sent to email.", 
      email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify OTP Route
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otpCode !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ message: "Invalid or expired OTP code" });
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET || 'homeplates_super_secret_key_2025', 
      { expiresIn: "7d" }
    );

    res.json({ 
      success: true, 
      token, 
      user: { 
        _id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        img: user.img, 
        city: user.city, 
        isVerified: user.isVerified 
      } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resend OTP Route
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #1A2316;">Verification OTP Code</h2>
        <p>Use the following code to verify your email address:</p>
        <div style="font-size: 24px; font-weight: bold; background-color: #f7f7f7; padding: 10px; width: fit-content; border-radius: 5px; color: #FBBF24; letter-spacing: 2px;">
          ${otp}
        </div>
        <p>Regards,<br/>HomePlates Team</p>
      </div>
    `;
    await sendEmail(email, "HomePlates — Resent OTP Code", emailHtml);
    res.json({ 
      message: "OTP resent successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Check if email is verified
    if (!user.isEmailVerified) {
      // Re-trigger OTP sending
      const otp = generateOTP();
      user.otpCode = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #1A2316;">Email Verification Required</h2>
          <p>Please enter the following OTP code to verify your account:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #f7f7f7; padding: 10px; width: fit-content; border-radius: 5px; color: #FBBF24; letter-spacing: 2px;">
            ${otp}
          </div>
          <p>Regards,<br/>HomePlates Team</p>
        </div>
      `;
      await sendEmail(email, "HomePlates — Email Verification OTP", emailHtml);

      return res.status(403).json({ 
        requiresOtp: true, 
        message: "Email not verified. OTP sent to your email.",
        email
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET || 'homeplates_super_secret_key_2025', 
      { expiresIn: "7d" }
    );

    res.json({ 
      success: true, 
      token, 
      user: { 
        _id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        img: user.img, 
        city: user.city, 
        isVerified: user.isVerified 
      } 
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Forgot Password Route
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #1A2316;">Password Reset Request</h2>
        <p>Use the following OTP code to reset your password:</p>
        <div style="font-size: 24px; font-weight: bold; background-color: #f7f7f7; padding: 10px; width: fit-content; border-radius: 5px; color: #FBBF24; letter-spacing: 2px;">
          ${otp}
        </div>
        <p>This code is valid for 10 minutes.</p>
        <p>Regards,<br/>HomePlates Team</p>
      </div>
    `;
    await sendEmail(email, "HomePlates — Password Reset Code", emailHtml);

    res.json({ message: "Reset OTP sent to your email", email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Password Route
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otpCode !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ message: "Invalid or expired OTP code" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
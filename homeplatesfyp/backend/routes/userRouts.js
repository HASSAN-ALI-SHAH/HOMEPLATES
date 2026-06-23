const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Menu = require('../models/Menu');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + path.extname(file.originalname))
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// 1. Public Get User Profile (used by UserProfile.jsx which does not send Auth header)
router.get('/profile/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get User Profile (Protected - fallback)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // Ensure they only read their own profile unless they are an admin
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized access to profile" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update User Profile
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized update" });
    }

    const { 
      name, phone, address, city, img, specialty, experience, vehicle, zone, isActive,
      kitchenName, about, cnic,
      weeklyBreakfastPrice, weeklyLunchPrice, weeklyDinnerPrice,
      monthlyBreakfastPrice, monthlyLunchPrice, monthlyDinnerPrice,
      locationLat, locationLng   // ← chef kitchen coordinates
    } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (address !== undefined) updateData.address = address;
    if (city) updateData.city = city;
    
    // Set profile image from file upload or fallback to passed string
    if (req.file) {
      updateData.img = `/uploads/${req.file.filename}`;
    } else if (img) {
      updateData.img = img;
    }

    if (kitchenName !== undefined) updateData.kitchenName = kitchenName;
    if (about !== undefined) updateData.about = about;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    // Chef fields
    if (specialty !== undefined) updateData.specialty = specialty;
    if (experience !== undefined) updateData.experience = experience;
    if (weeklyBreakfastPrice !== undefined && weeklyBreakfastPrice !== '') updateData.weeklyBreakfastPrice = Number(weeklyBreakfastPrice);
    if (weeklyLunchPrice !== undefined && weeklyLunchPrice !== '') updateData.weeklyLunchPrice = Number(weeklyLunchPrice);
    if (weeklyDinnerPrice !== undefined && weeklyDinnerPrice !== '') updateData.weeklyDinnerPrice = Number(weeklyDinnerPrice);
    if (monthlyBreakfastPrice !== undefined && monthlyBreakfastPrice !== '') updateData.monthlyBreakfastPrice = Number(monthlyBreakfastPrice);
    if (monthlyLunchPrice !== undefined && monthlyLunchPrice !== '') updateData.monthlyLunchPrice = Number(monthlyLunchPrice);
    if (monthlyDinnerPrice !== undefined && monthlyDinnerPrice !== '') updateData.monthlyDinnerPrice = Number(monthlyDinnerPrice);

    // Rider fields
    if (vehicle) updateData.vehicle = vehicle;
    if (zone) updateData.zone = zone;

    // Kitchen GPS coordinates (chef sets once, riders/customers see exact pin)
    if (locationLat !== undefined && locationLng !== undefined) {
      updateData['location.lat'] = parseFloat(locationLat);
      updateData['location.lng'] = parseFloat(locationLng);
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Reset rider verification if previously rejected and updating profile details
    if (user.role === 'rider' && user.verificationStatus === 'rejected') {
      updateData.verificationStatus = 'pending';
      updateData.isVerified = false;
      updateData.rejectionReason = null;
      
      try {
        const Notification = require('../models/Notification');
        const socketHelper = require('../socket');
        
        const newNotification = new Notification({
          recipientRole: 'admin',
          type: 'rider_pending',
          referenceId: user._id,
          message: `Rider ${name || user.name} has resubmitted their verification request.`
        });
        await newNotification.save();
        
        const io = socketHelper.getIo();
        io.to('admin_room').emit('newRiderPending', {
          riderId: user._id,
          name: name || user.name,
          vehicleType: vehicle || user.vehicle || 'Motorcycle',
          createdAt: new Date()
        });
      } catch (e) {
        console.error("Error creating resubmission notification:", e);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, 
      { $set: updateData }, 
      { new: true }
    ).select('-password');

    // Update all chef's dishes to match new city if city is updated
    if (updatedUser.role === 'chef' && city) {
      await Menu.updateMany({ chefId: req.params.id }, { $set: { city } });
    }

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Change Password
router.put('/:id/password', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ message: "Unauthorized password change" });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

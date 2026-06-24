const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Helper to reverse geocode via Nominatim
router.get('/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: "Latitude and longitude are required" });
    }
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    // Fetch with User-Agent as required by Nominatim Policy
    const response = await fetch(url, {
      headers: { 'User-Agent': 'HomePlates/1.0 (homeplates.fyp@gmail.com)' }
    });
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to reverse geocode via Nominatim" });
    }
    const data = await response.json();
    res.json({ address: data.display_name || 'Unknown Address' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Customer's Location Coordinates
router.put('/location', authMiddleware, async (req, res) => {
  try {
    const { coordinates, formattedAddress } = req.body;
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ error: "Valid GeoJSON coordinates [longitude, latitude] are required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.accountLocation = {
      type: 'Point',
      coordinates,
      formattedAddress
    };

    await user.save();
    res.json({ message: "Account location updated successfully", user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      city: user.city,
      accountLocation: user.accountLocation
    } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Chefs near the logged-in customer within 8km
router.get('/near-me', authMiddleware, async (req, res) => {
  try {
    const customer = await User.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (!customer.accountLocation || !customer.accountLocation.coordinates || customer.accountLocation.coordinates.length !== 2) {
      return res.json({ locationRequired: true, message: "Set your location to see nearby restaurants." });
    }

    const RADIUS_METERS = 8000; // 8 km

    const nearbyChefs = await User.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: customer.accountLocation.coordinates // [lng, lat]
          },
          key: 'kitchenLocationGeo',
          distanceField: 'distanceInMeters',
          maxDistance: RADIUS_METERS,
          spherical: true,
          query: { role: 'chef', isVerified: true, isActive: true } // keep consistent with existing chef-visibility rules
        }
      },
      {
        $addFields: {
          distanceInKm: { $round: [{ $divide: ['$distanceInMeters', 1000] }, 1] }
        }
      },
      {
        $project: {
          password: 0
        }
      }
    ]);

    res.json(nearbyChefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

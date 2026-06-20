const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');

// Get all active dishes (used by ExploreFood.jsx /api/all-dishes or /api/dishes)
// Only returns dishes from VERIFIED and ACTIVE chefs
router.get('/', async (req, res) => {
  try {
    const { city } = req.query;
    let query = { isAvailable: true };
    if (city) {
      query.city = city;
    }
    const dishes = await Menu.find(query).populate('chefId', 'name rating img city isVerified isActive');
    // Filter: only show dishes whose chef is verified AND active
    const filteredDishes = dishes.filter(d => d.chefId && d.chefId.isVerified === true && d.chefId.isActive !== false);
    res.json(filteredDishes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /all fallback
// Only returns dishes from VERIFIED and ACTIVE chefs
router.get('/all', async (req, res) => {
  try {
    const { city } = req.query;
    let query = { isAvailable: true };
    if (city) {
      query.city = city;
    }
    const dishes = await Menu.find(query).populate('chefId', 'name rating img city isVerified isActive');
    // Filter: only show dishes whose chef is verified AND active
    const filteredDishes = dishes.filter(d => d.chefId && d.chefId.isVerified === true && d.chefId.isActive !== false);
    res.json(filteredDishes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
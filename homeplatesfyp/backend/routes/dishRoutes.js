const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');

// Get all active dishes (used by ExploreFood.jsx /api/all-dishes or /api/dishes)
router.get('/', async (req, res) => {
  try {
    const dishes = await Menu.find({ isAvailable: true }).populate('chefId', 'name rating img city');
    res.json(dishes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /all fallback
router.get('/all', async (req, res) => {
  try {
    const dishes = await Menu.find({ isAvailable: true }).populate('chefId', 'name rating img city');
    res.json(dishes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
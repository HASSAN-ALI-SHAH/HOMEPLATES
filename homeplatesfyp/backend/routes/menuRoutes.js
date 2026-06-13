const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');

// GET active menu for a chef (used by ChefProfile.jsx /api/menu/:chefId)
router.get('/:chefId', async (req, res) => {
  try {
    const menu = await Menu.find({ chefId: req.params.chefId, isAvailable: true });
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

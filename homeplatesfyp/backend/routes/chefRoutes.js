const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Menu = require('../models/Menu');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const Recipe = require('../models/Recipe');
const WalletTransaction = require('../models/WalletTransaction');
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

// ----------------------------------------------------
// 1. Chef Discovery (Public)
// ----------------------------------------------------

// Get all verified/active chefs with filters (used by AllChefs.jsx)
router.get('/', async (req, res) => {
  try {
    const { city, specialty } = req.query;
    let query = { role: 'chef', isVerified: true, isActive: true };
    
    if (city) query.city = city;
    if (specialty) query.specialty = { $regex: specialty, $options: 'i' };

    const chefs = await User.find(query).select('-password').sort({ rating: -1 });
    res.json(chefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Chef Profile & Menu (used by ChefProfile.jsx)
router.get('/:id/profile', async (req, res) => {
  try {
    const chef = await User.findOne({ _id: req.params.id, role: 'chef' }).select('-password');
    if (!chef) {
      return res.status(404).json({ message: "Chef not found" });
    }
    const menu = await Menu.find({ chefId: req.params.id, isAvailable: true });
    res.json({ chef, menu });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. Menu Management (Protected)
// ----------------------------------------------------

// Get all menu items for a specific chef
router.get('/:chefId/menu', async (req, res) => {
  try {
    const menu = await Menu.find({ chefId: req.params.chefId });
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all menu items for the logged-in chef (used by ChefDashboard.jsx)
router.get('/add-dish', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Chef only!" });
    }
    const menu = await Menu.find({ chefId: req.user.id });
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new dish (used by AddDishPage.jsx)
router.post('/add-dish', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Chef only!" });
    }
    const { name, category, prepTime, description, price, chefId, chef, pricingDetails } = req.body;

    // Validation checks
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Dish name is required" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ error: "Category is required" });
    }
    if (!prepTime || !prepTime.trim()) {
      return res.status(400).json({ error: "Preparation time is required" });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Description is required" });
    }
    if (!price || isNaN(price) || Number(price) <= 0) {
      return res.status(400).json({ error: "Price must be a valid number greater than 0" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Dish image is required" });
    }
    
    // Fetch chef's city
    const chefUser = await User.findById(req.user.id);
    const chefCity = chefUser ? chefUser.city : undefined;
    
    // Parse pricing details
    let parsedPricing = {};
    if (pricingDetails) {
      parsedPricing = typeof pricingDetails === 'string' ? JSON.parse(pricingDetails) : pricingDetails;
    }

    // Calculate profit and margin automatically if price is set
    const rawMaterials = parsedPricing.rawMaterials || 0;
    const packaging = parsedPricing.packaging || 0;
    const gasElectric = parsedPricing.gasElectric || 0;
    const totalCost = rawMaterials + packaging + gasElectric;
    const finalPrice = Number(price);
    const profit = finalPrice - totalCost;
    const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;

    const newDish = new Menu({
      name,
      chef,
      chefId,
      city: chefCity,
      category,
      price: finalPrice,
      description,
      prepTime,
      img: `/uploads/${req.file.filename}`,
      tag: 'New',
      isAvailable: true,
      pricingDetails: {
        rawMaterials,
        packaging,
        gasElectric,
        profit,
        margin: Math.round(margin)
      }
    });

    await newDish.save();
    res.status(201).json({ message: "Dish added!", dish: newDish });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get a single dish details by ID (used by EditDishPage.jsx)
router.get('/dish/:dishId', async (req, res) => {
  try {
    const dish = await Menu.findById(req.params.dishId);
    if (!dish) return res.status(404).json({ message: "Dish not found" });
    res.json(dish);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update dish details (used by EditDishPage.jsx)
router.put('/dish/:dishId', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, price, description, isAvailable, category, prepTime, pricingDetails } = req.body;
    
    const dish = await Menu.findById(req.params.dishId);
    if (!dish) return res.status(404).json({ message: "Dish not found" });

    // Enforce chef authorization
    if (dish.chefId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to update this dish" });
    }

    // Backend validations
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: "Dish name cannot be empty" });
      dish.name = name;
    }
    if (price !== undefined) {
      if (isNaN(price) || Number(price) <= 0) return res.status(400).json({ error: "Price must be a valid number greater than 0" });
      dish.price = Number(price);
    }
    if (category !== undefined) {
      if (!category.trim()) return res.status(400).json({ error: "Category cannot be empty" });
      dish.category = category;
    }
    if (prepTime !== undefined) {
      if (!prepTime.trim()) return res.status(400).json({ error: "Preparation time cannot be empty" });
      dish.prepTime = prepTime;
    }
    if (description !== undefined) {
      if (!description.trim()) return res.status(400).json({ error: "Description cannot be empty" });
      dish.description = description;
    }

    if (req.file) {
      dish.img = `/uploads/${req.file.filename}`;
    }

    if (isAvailable !== undefined) {
      dish.isAvailable = String(isAvailable) === 'true';
    }

    if (pricingDetails) {
      const parsedPricing = typeof pricingDetails === 'string' ? JSON.parse(pricingDetails) : pricingDetails;
      const rawMaterials = parsedPricing.rawMaterials || 0;
      const packaging = parsedPricing.packaging || 0;
      const gasElectric = parsedPricing.gasElectric || 0;
      const totalCost = rawMaterials + packaging + gasElectric;
      const finalPrice = price ? Number(price) : dish.price;
      const profit = finalPrice - totalCost;
      const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;

      dish.pricingDetails = {
        rawMaterials,
        packaging,
        gasElectric,
        profit,
        margin: Math.round(margin)
      };
    }

    await dish.save();
    res.json({ message: "Dish updated!", dish });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete dish
router.delete('/dish/:dishId', authMiddleware, async (req, res) => {
  try {
    const dish = await Menu.findById(req.params.dishId);
    if (!dish) return res.status(404).json({ message: "Dish not found" });

    if (dish.chefId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized" });
    }

    await Menu.findByIdAndDelete(req.params.dishId);
    res.json({ message: "Dish deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle availability
router.patch('/dish/:dishId/toggle', authMiddleware, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const dish = await Menu.findById(req.params.dishId);
    if (!dish) return res.status(404).json({ message: "Dish not found" });

    if (dish.chefId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized" });
    }

    dish.isAvailable = isAvailable;
    await dish.save();
    res.json({ message: "Availability updated", isAvailable: dish.isAvailable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. Order Management
// ----------------------------------------------------

// Get orders for a specific chef (used by ChefDashboard.jsx)
router.get('/:chefId/orders', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.chefId && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Unauthorized access to chef orders" });
    }
    const { status } = req.query;
    let query = { chef: req.params.chefId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('user', 'name phone address')
      .populate('items.dishId', 'name img')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. Wallet & Withdrawals (Protected)
// ----------------------------------------------------

// Get Chef Wallet Data
router.get('/:chefId/wallet', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.chefId && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Unauthorized wallet access" });
    }
    const chef = await User.findById(req.params.chefId);
    if (!chef) return res.status(404).json({ message: "Chef not found" });

    const transactions = await WalletTransaction.find({ chefId: req.params.chefId })
      .sort({ createdAt: -1 });

    // Compute withdrawn total
    const approvedWithdrawals = await WalletTransaction.find({ 
      chefId: req.params.chefId, 
      type: 'debit', 
      status: 'approved' 
    });
    const withdrawnTotal = approvedWithdrawals.reduce((sum, tx) => sum + tx.amount, 0);

    res.json({
      totalBalance: chef.wallet,
      pendingBalance: chef.pendingBalance,
      withdrawnTotal,
      transactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request Withdrawal
router.post('/wallet/withdraw', authMiddleware, async (req, res) => {
  try {
    const { chefId, amount, paymentMethod, accountDetails } = req.body;

    if (chefId !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized wallet access" });
    }

    const withdrawAmount = Number(amount);
    if (withdrawAmount < 1000) {
      return res.status(400).json({ message: "Minimum withdrawal is Rs. 1000" });
    }

    const chef = await User.findById(chefId);
    if (chef.wallet < withdrawAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Deduct from chef.wallet immediately, put in pendingBalance
    chef.wallet -= withdrawAmount;
    chef.pendingBalance += withdrawAmount;
    await chef.save();

    const request = new WalletTransaction({
      chefId,
      type: 'debit',
      amount: withdrawAmount,
      paymentMethod,
      accountDetails,
      status: 'pending'
    });

    await request.save();
    res.status(201).json({ message: "Withdrawal request submitted", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Transaction logs
router.get('/:chefId/wallet/transactions', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.chefId && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Unauthorized transaction access" });
    }
    const transactions = await WalletTransaction.find({ chefId: req.params.chefId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. Subscription Management
// ----------------------------------------------------

// Get subscriptions for a chef
router.get('/:chefId/subscriptions', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.chefId && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Unauthorized subscription access" });
    }
    // Find all users who are not admins
    const nonAdminUsers = await User.find({ role: { $ne: 'admin' } }).select('_id');
    const nonAdminIds = nonAdminUsers.map(u => u._id);

    const subscriptions = await Subscription.find({ 
      chefId: req.params.chefId,
      userId: { $in: nonAdminIds }
    })
      .populate('userId', 'name email phone address role');
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 6. Recipe Management
// ----------------------------------------------------

// Add a new recipe
router.post('/recipes/add', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Chef only!" });
    }
    const { name, time, difficulty, ingredients, steps } = req.body;
    
    // Parse JSON arrays from client
    let parsedIngredients = [];
    if (ingredients) {
      parsedIngredients = typeof ingredients === 'string' ? JSON.parse(ingredients) : ingredients;
    }
    let parsedSteps = [];
    if (steps) {
      parsedSteps = typeof steps === 'string' ? JSON.parse(steps) : steps;
    }

    const newRecipe = new Recipe({
      chefId: req.user.id,
      name,
      time,
      difficulty,
      img: req.file ? `/uploads/${req.file.filename}` : '',
      ingredients: parsedIngredients,
      steps: parsedSteps
    });

    await newRecipe.save();
    res.status(201).json({ message: "Recipe added!", recipe: newRecipe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all recipes for a specific chef (public)
router.get('/recipes/chef/:chefId', async (req, res) => {
  try {
    const recipes = await Recipe.find({ chefId: req.params.chefId }).sort({ createdAt: -1 });
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a recipe
router.delete('/recipes/:recipeId', authMiddleware, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.recipeId);
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    if (recipe.chefId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to delete this recipe" });
    }

    await Recipe.findByIdAndDelete(req.params.recipeId);
    res.json({ message: "Recipe deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
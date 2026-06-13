const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');

// Helper to recalculate total price of a cart
const recalculateTotalPrice = (cart) => {
  cart.totalPrice = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  return cart.totalPrice;
};

// 1. Get User's Cart (Or create one if not existing)
router.get('/:userId', async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.params.userId }).populate('items.dishId', 'name img price');
    if (!cart) {
      cart = new Cart({ userId: req.params.userId, items: [], totalPrice: 0 });
      await cart.save();
    }
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add Item to Cart
router.post('/add', async (req, res) => {
  try {
    const { userId, dishId, dishName, price, quantity = 1 } = req.body;
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [], totalPrice: 0 });
    }

    const existingItemIndex = cart.items.findIndex(item => item.dishId.toString() === dishId);

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += Number(quantity);
    } else {
      cart.items.push({
        dishId,
        dishName,
        price: Number(price),
        quantity: Number(quantity)
      });
    }

    recalculateTotalPrice(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update Cart Item Quantity
router.patch('/update', async (req, res) => {
  try {
    const { userId, dishId, quantity } = req.body;
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item.dishId.toString() === dishId);
    if (itemIndex > -1) {
      if (Number(quantity) <= 0) {
        // Remove item if quantity goes to 0 or negative
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = Number(quantity);
      }
      recalculateTotalPrice(cart);
      await cart.save();
      res.json(cart);
    } else {
      res.status(404).json({ message: "Item not found in cart" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Remove Item from Cart
router.post('/remove', async (req, res) => {
  try {
    const { userId, dishId } = req.body;
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(item => item.dishId.toString() !== dishId);
    recalculateTotalPrice(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Clear Cart
router.delete('/clear/:userId', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });
    if (cart) {
      cart.items = [];
      cart.totalPrice = 0;
      await cart.save();
    }
    res.json({ message: "Cart cleared successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

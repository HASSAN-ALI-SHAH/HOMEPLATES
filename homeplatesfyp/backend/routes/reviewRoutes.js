const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// 1. Post a Review (Protected)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { chefId, riderId, orderId, rating, comment } = req.body;
    const userId = req.user.id;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5 stars" });
    }

    const newReview = new Review({
      userId,
      chefId: chefId || undefined,
      riderId: riderId || undefined,
      orderId: orderId || undefined,
      rating: Number(rating),
      comment
    });

    await newReview.save();

    if (chefId) {
      // Recalculate average rating & total reviews count for Chef
      const reviews = await Review.find({ chefId });
      const totalReviews = reviews.length;
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;

      await User.findByIdAndUpdate(chefId, {
        rating: Number(avgRating.toFixed(1)),
        totalReviews
      });
    }

    if (riderId) {
      // Recalculate average rating & total reviews count for Rider
      const reviews = await Review.find({ riderId });
      const totalReviews = reviews.length;
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;

      await User.findByIdAndUpdate(riderId, {
        rating: Number(avgRating.toFixed(1)),
        totalReviews
      });
    }

    res.status(201).json({ message: "Review posted successfully!", review: newReview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Platform Reviews
router.get('/platform', async (req, res) => {
  try {
    const reviews = await Review.find({ 
      $or: [{ chefId: null }, { chefId: { $exists: false } }] 
    })
    .populate('userId', 'name img')
    .sort({ createdAt: -1 });
    
    // Fallback: If no populated user but Fatima is simulated on frontend, we send it cleanly.
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Paginated Chef Reviews
router.get('/chef/:chefId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skipIndex = (page - 1) * limit;

    const reviews = await Review.find({ chefId: req.params.chefId })
      .populate('userId', 'name img')
      .skip(skipIndex)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Review.countDocuments({ chefId: req.params.chefId });

    res.json({
      reviews,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get User Reviews
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.params.userId })
      .populate('chefId', 'name specialty kitchenName about img')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

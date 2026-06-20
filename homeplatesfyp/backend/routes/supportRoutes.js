const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const authMiddleware = require('../middleware/auth');

// -------------------------------------------------------
// 1. Submit a Support Ticket (Public — any user can submit)
// -------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { name, email, userId, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'All fields (name, email, subject, message) are required.' });
    }
    const ticket = new SupportTicket({ name, email, userId: userId || undefined, subject, message });
    await ticket.save();
    res.status(201).json({ message: 'Support request submitted successfully! We will get back to you soon.', ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// 2. Get all tickets for a logged-in user (Protected)
// -------------------------------------------------------
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

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

// 3. Get single ticket details (Protected)
router.get('/my-queries/:id', authMiddleware, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my/:id', authMiddleware, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get customer notifications (Protected)
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const list = await Notification.find({ recipientId: req.user.id }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Mark customer notification as read (Protected)
router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const noti = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { isRead: true },
      { new: true }
    );
    res.json(noti);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Clear customer notifications (Protected)
router.delete('/notifications', authMiddleware, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    await Notification.deleteMany({ recipientId: req.user.id });
    res.json({ message: 'Notifications cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

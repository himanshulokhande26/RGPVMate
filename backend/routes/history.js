// routes/history.js — Chat History
// Full implementation: Phase 6
'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authGuard');

// GET /api/history — last 50 Q&A pairs for logged-in user
router.get('/', requireAuth, async (req, res, next) => {
  try {
    // TODO Phase 6: const history = await ChatHistory.find({ userId: req.user.googleId }).sort({ createdAt: -1 }).limit(50);
    res.json({ history: [] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/history — clear all history for logged-in user
router.delete('/', requireAuth, async (req, res, next) => {
  try {
    // TODO Phase 6: await ChatHistory.deleteMany({ userId: req.user.googleId });
    res.json({ message: 'History cleared' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

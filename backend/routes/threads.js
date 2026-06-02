'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authGuard');
const Thread = require('../models/Thread');
const Message = require('../models/Message');

// GET /api/chat/threads - List user's threads
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.googleId || req.user.id;
    const threads = await Thread.find({ userId }).sort({ updatedAt: -1 }).limit(50);
    res.json({ threads });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching threads' });
  }
});

// GET /api/chat/threads/:threadId - Get messages for a thread
router.get('/:threadId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.googleId || req.user.id;
    const thread = await Thread.findOne({ _id: req.params.threadId, userId });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const messages = await Message.find({ threadId: thread._id }).sort({ createdAt: 1 });
    res.json({ thread, messages });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

// DELETE /api/chat/threads/:threadId - Delete a thread
router.delete('/:threadId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.googleId || req.user.id;
    const thread = await Thread.findOneAndDelete({ _id: req.params.threadId, userId });
    if (thread) {
      await Message.deleteMany({ threadId: thread._id });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error deleting thread' });
  }
});

module.exports = router;

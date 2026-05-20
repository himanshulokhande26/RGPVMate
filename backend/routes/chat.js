// routes/chat.js — POST /api/chat
// Full implementation: Phase 4
'use strict';

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authGuard');

// POST /api/chat
// Body: { question: string, semester?: number, branch?: string }
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { question, semester, branch } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // TODO Phase 4: Wire retriever + llm pipeline
    // const vector = await getEmbedding(question);
    // const chunks = await searchChunks(vector, { semester, branch }, 4);
    // const { answer, sources } = await generateAnswer(question, chunks);
    // if (req.user) saveHistory(req.user.googleId, question, answer, sources, semester, branch);

    res.json({
      answer: 'Chat pipeline coming in Phase 4.',
      sources: [],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

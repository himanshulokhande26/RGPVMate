// routes/chat.js — POST /api/chat
// Phase 4: RAG pipeline fully wired
'use strict';

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authGuard');
const { getEmbedding, searchChunks } = require('../services/retriever');
const { generateAnswer } = require('../services/llm');
const ChatHistory = require('../models/ChatHistory');

// POST /api/chat
// Body: { question: string, semester?: number, branch?: string }
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { question, semester, branch } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // ── Step 1: Embed the student's question ──────────────────
    const vector = await getEmbedding(question.trim());

    // ── Step 2: Retrieve top-4 semantically relevant chunks ───
    // Apply semester/branch filters if provided (logged-in students get personalised results)
    const filters = {};
    if (semester) filters.semester = Number(semester);
    if (branch)   filters.branch   = branch;

    const chunks = await searchChunks(vector, filters, 4);

    // ── Step 3: Generate grounded answer via Gemini ───────────
    const { answer, sources } = await generateAnswer(question.trim(), chunks);

    // ── Step 4: Persist to MongoDB (logged-in users only) ─────
    // Fire-and-forget — don't await so the response isn't delayed
    if (req.user) {
      ChatHistory.saveAndCap({
        userId:   req.user.googleId,
        question: question.trim(),
        answer,
        sources,
        semester: semester ? Number(semester) : undefined,
        branch:   branch   || undefined,
      }).catch(err => console.error('[chat] History save failed:', err.message));
    }

    // ── Step 5: Return answer + sources to frontend ───────────
    res.json({ answer, sources });

  } catch (err) {
    // Provide friendlier error if embedder or ChromaDB is unreachable
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Embedder service is unavailable. Make sure the Python embedder is running.',
      });
    }
    next(err);
  }
});

module.exports = router;

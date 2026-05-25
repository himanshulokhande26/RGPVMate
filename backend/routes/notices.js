// routes/notices.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — Notices API Route  (Phase 4.5)
//
// Endpoints:
//   GET  /api/notices           → paginated list (latest first, optional category/level filter)
//   GET  /api/notices/alerts    → only HIGH + MEDIUM alert-level notices (for pop-up UI)
//   GET  /api/notices/:id       → single notice by MongoDB _id
//
// Query params for GET /api/notices:
//   ?category=exam|result|admission|scholarship|fee|date_sheet|general
//   ?alertLevel=high|medium|low
//   ?limit=20   (default 20, max 100)
//   ?page=1     (1-indexed)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();
const Notice  = require('../models/Notice');

// ── GET /api/notices ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, alertLevel, limit = 20, page = 1 } = req.query;

    const filter = {};
    if (category)   filter.category   = category;
    if (alertLevel) filter.alertLevel = alertLevel;

    const lim  = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;

    const [notices, total] = await Promise.all([
      Notice.find(filter)
        .sort({ publishedAt: -1, scrapedAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      Notice.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      limit: lim,
      pages: Math.ceil(total / lim),
      notices,
    });
  } catch (err) {
    console.error('[notices] GET /api/notices error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch notices' });
  }
});

// ── GET /api/notices/alerts ───────────────────────────────────────────────────
// Returns only HIGH and MEDIUM priority notices (for front-end alert banners)
router.get('/alerts', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    const notices = await Notice.find({
      alertLevel: { $in: ['high', 'medium'] },
    })
      .sort({ publishedAt: -1, scrapedAt: -1 })
      .limit(lim)
      .lean();

    res.json({ success: true, count: notices.length, notices });
  } catch (err) {
    console.error('[notices] GET /api/notices/alerts error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
});

// ── GET /api/notices/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id).lean();
    if (!notice) return res.status(404).json({ success: false, error: 'Notice not found' });
    res.json({ success: true, notice });
  } catch (err) {
    console.error('[notices] GET /api/notices/:id error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch notice' });
  }
});

module.exports = router;

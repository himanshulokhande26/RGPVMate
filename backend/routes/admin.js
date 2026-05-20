// routes/admin.js — Admin Panel API (document lifecycle management)
// Full implementation: Phase 7
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAdmin } = require('../middleware/adminGuard');

// Multer config — temp storage before ingestion
const upload = multer({
  dest: path.join(__dirname, '../documents/tmp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// All admin routes require password in x-admin-password header
router.use(requireAdmin);

// GET /api/admin/documents — list all documents in ChromaDB with chunk counts
router.get('/documents', async (req, res, next) => {
  try {
    // TODO Phase 7: query ChromaDB for unique sources + count chunks per source
    res.json({ documents: [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/documents/upload — ingest a new PDF
router.post('/documents/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    const { documentType, semester, branch, scheme } = req.body;
    // TODO Phase 7: chunker.js → retriever.addChunks()
    res.json({ message: 'Upload + ingestion coming in Phase 7', file: req.file?.originalname });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/documents/:sourceName — replace an existing document
router.put('/documents/:sourceName', upload.single('pdf'), async (req, res, next) => {
  try {
    const { sourceName } = req.params;
    // TODO Phase 7: retriever.deleteBySource(sourceName) → ingest new file
    res.json({ message: `Replace for ${sourceName} coming in Phase 7` });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/documents/:sourceName — delete all chunks from a source
router.delete('/documents/:sourceName', async (req, res, next) => {
  try {
    const { sourceName } = req.params;
    // TODO Phase 7: retriever.deleteBySource(sourceName)
    res.json({ message: `Delete for ${sourceName} coming in Phase 7` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

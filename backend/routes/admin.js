// routes/admin.js — Admin Panel API (document lifecycle management)
// Full implementation: Phase 7
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAdmin } = require('../middleware/adminGuard');
const { listDocuments, deleteChunksBySource, addChunks, getEmbedding } = require('../services/retriever');
const { chunkDocument } = require('../services/chunker');
const User = require('../models/User');
const Thread = require('../models/Thread');
const Message = require('../models/Message');
const fs = require('fs');
const axios = require('axios');

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

// GET /api/admin/stats - overall system stats
router.get('/stats', async (req, res, next) => {
  try {
    const users = await User.countDocuments();
    const threads = await Thread.countDocuments();
    const messages = await Message.countDocuments();
    
    // Get unique documents from Qdrant
    const docs = await listDocuments();
    const totalChunks = docs.reduce((acc, doc) => acc + doc.chunks, 0);

    res.json({
      users,
      threads,
      messages,
      documents: docs.length,
      chunks: totalChunks
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/documents — list all documents in ChromaDB with chunk counts
router.get('/documents', async (req, res, next) => {
  try {
    const docs = await listDocuments();
    res.json({ documents: docs });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/documents/upload — ingest a new PDF
router.post('/documents/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

    const { documentType, semester, branch, scheme } = req.body;
    const sourceName = req.file.originalname;

    console.log(`[admin] Upload received: ${sourceName} (${req.file.size} bytes)`);

    // 1. Read file and encode as Base64
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfB64 = pdfBuffer.toString('base64');

    // 2. Call python embedder for extraction
    const extractRes = await axios.post(`${process.env.EMBEDDER_URL}/extract-text`, {
      pdf_b64: pdfB64,
    });
    
    const text = extractRes.data.text;
    if (!text || text.trim().length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No text could be extracted from PDF' });
    }

    // 3. Chunk the document
    const metadata = {
      source: sourceName,
      type: documentType,
      semester: semester ? Number(semester) : null,
      branch: branch || null,
      scheme: scheme || null,
    };
    
    // Clean up empty metadata
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === null || metadata[key] === undefined || metadata[key] === '') {
        delete metadata[key];
      }
    });

    console.log(`[admin] Chunking document type: ${documentType}...`);
    const chunks = chunkDocument(text, metadata);
    console.log(`[admin] Generated ${chunks.length} chunks. Getting embeddings...`);

    // 4. Get embeddings for each chunk
    const embeddedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await getEmbedding(chunk.text);
      embeddedChunks.push({
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
        vector: vector
      });
      // Basic progress log for large files
      if ((i + 1) % 50 === 0) console.log(`[admin] Embedded ${i + 1}/${chunks.length} chunks...`);
    }

    // 5. Add to Qdrant
    await addChunks(embeddedChunks);

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    res.json({ success: true, message: `Ingested ${chunks.length} chunks successfully`, chunks: chunks.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('[admin] Ingestion error:', err.message);
    res.status(500).json({ error: 'Internal server error during ingestion' });
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
    await deleteChunksBySource(sourceName);
    res.json({ success: true, message: `Deleted ${sourceName}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

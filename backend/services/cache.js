// services/cache.js
// MongoDB-backed response cache for RGPVMate
// Serves repeated questions at ZERO API cost
// TTL: 7 days (RGPV syllabus doesn't change frequently)
'use strict';

const mongoose = require('mongoose');

// ── Schema ────────────────────────────────────────────────────────────────────
const responseCacheSchema = new mongoose.Schema({
  // Normalized cache key: lowercase, trimmed, punctuation-stripped question
  cacheKey: { type: String, required: true, unique: true, index: true },

  // Original question (for debugging/display)
  question: { type: String, required: true },

  // Cached response
  answer:  { type: String, required: true },
  sources: { type: [String], default: [] },

  // Metadata
  hitCount: { type: Number, default: 0 },
  cachedAt: { type: Date, default: Date.now },

  // Auto-expire after 7 days (TTL index)
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
}, {
  collection: 'response_cache',
});

// TTL index: MongoDB auto-deletes documents after expiresAt
responseCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ResponseCache = mongoose.model('ResponseCache', responseCacheSchema);

// ── Key Normalization ─────────────────────────────────────────────────────────
function normalizeKey(question) {
  return question
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ')  // strip punctuation
    .replace(/\s+/g, ' ')                             // collapse whitespace
    .trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a cached answer.
 * @param {string} question
 * @returns {Promise<{ answer: string, sources: string[], fromCache: true } | null>}
 */
async function getCached(question) {
  const key = normalizeKey(question);
  try {
    const doc = await ResponseCache.findOneAndUpdate(
      { cacheKey: key },
      { $inc: { hitCount: 1 } },
      { new: true }
    );
    if (doc) {
      console.log(`⚡ [Cache HIT] "${question}" (hit #${doc.hitCount})`);
      return { answer: doc.answer, sources: doc.sources, fromCache: true };
    }
  } catch (err) {
    console.warn('⚠️ [Cache] Read error (non-fatal):', err.message);
  }
  return null;
}

/**
 * Save a new answer to cache.
 * @param {string} question
 * @param {string} answer
 * @param {string[]} sources
 */
async function setCached(question, answer, sources = []) {
  const key = normalizeKey(question);
  try {
    await ResponseCache.findOneAndUpdate(
      { cacheKey: key },
      {
        cacheKey: key,
        question,
        answer,
        sources,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );
    console.log(`💾 [Cache SET] "${question}"`);
  } catch (err) {
    console.warn('⚠️ [Cache] Write error (non-fatal):', err.message);
  }
}

module.exports = { getCached, setCached };

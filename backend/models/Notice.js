// models/Notice.js
// ─────────────────────────────────────────────────────────────────────────────
// RGPVMate — Notice Document Model
// Stores scraped RGPV notices from the official website.
// Used by: scrape_notices.js (write), routes/notices.js (read), chat.js (alert injection)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const NoticeSchema = new mongoose.Schema(
  {
    // ── Core Identity ──────────────────────────────────────────────────────────
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Unique hash: prevents duplicate ingestion across runs
    // Derived from: SHA1(title + date + link)
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ── Links & Attachments ────────────────────────────────────────────────────
    // Canonical page URL where this notice was found
    sourceUrl: {
      type: String,
      default: 'https://www.rgpv.ac.in',
    },

    // Direct PDF/attachment link (if available, else null)
    attachmentUrl: {
      type: String,
      default: null,
    },

    // ── Date & Metadata ────────────────────────────────────────────────────────
    // Published date as scraped from the notice page (may be approximate)
    publishedAt: {
      type: Date,
      default: null,
    },

    // When this record was first scraped
    scrapedAt: {
      type: Date,
      default: Date.now,
    },

    // ── Classification ─────────────────────────────────────────────────────────
    // Auto-detected category using keyword rules
    // e.g. 'exam', 'result', 'admission', 'scholarship', 'general'
    category: {
      type: String,
      enum: ['exam', 'result', 'admission', 'scholarship', 'fee', 'date_sheet', 'general'],
      default: 'general',
    },

    // Priority alert level for front-end pop-up display
    // 'high'   → shown immediately as modal/banner (exam, result dates)
    // 'medium' → shown as toast/notification (scholarships, fee)
    // 'low'    → quiet; accessible from notices feed only
    alertLevel: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'low',
    },

    // Whether this notice has been embedded into Qdrant
    ingested: {
      type: Boolean,
      default: false,
    },

    // Optional extracted text snippet (from PDF or notice body)
    snippet: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
    collection: 'notices',
  }
);

// ── Compound index for fast "latest N notices" queries ─────────────────────
NoticeSchema.index({ publishedAt: -1, category: 1 });
NoticeSchema.index({ alertLevel: 1, publishedAt: -1 });

module.exports = mongoose.model('Notice', NoticeSchema);

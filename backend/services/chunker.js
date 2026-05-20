// services/chunker.js
// Splits PDF text into meaningful units based on document type.
// This is the most critical design decision in the RAG pipeline.
// Full implementation: Phase 3
'use strict';

const crypto = require('crypto');

/**
 * Main entry point — routes to the correct strategy based on document type.
 * @param {string} text — raw text extracted from PDF
 * @param {string} documentType — 'syllabus' | 'pyq' | 'rules' | 'calendar' | 'fees'
 * @param {object} metadata — { source, semester, branch, subject, scheme, ... }
 * @returns {{ id: string, text: string, metadata: object }[]}
 */
function chunkDocument(text, documentType, metadata) {
  switch (documentType) {
    case 'syllabus':  return chunkSyllabus(text, metadata);
    case 'pyq':       return chunkPYQ(text, metadata);
    case 'rules':     return chunkRules(text, metadata);
    case 'calendar':  return chunkCalendar(text, metadata);
    case 'fees':      return chunkFees(text, metadata);
    default:
      throw new Error(`Unknown document type: ${documentType}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────

/** Generates a stable unique ID for a chunk */
function chunkId(source, index) {
  return crypto.createHash('md5').update(`${source}-${index}`).digest('hex');
}

/** Removes excess whitespace from a text block */
function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Wraps raw text splits into the standard chunk shape */
function makeChunks(splits, metadata) {
  return splits
    .map(clean)
    .filter(t => t.length > 50) // skip tiny fragments
    .map((text, i) => ({
      id: chunkId(metadata.source, i),
      text,
      metadata: { ...metadata },
    }));
}

// ── Chunking Strategies ───────────────────────────────────────

/**
 * Syllabus: split by UNIT heading.
 * Each unit is self-contained — clean semantic boundary.
 * Example boundary: "UNIT 1", "UNIT-1", "Unit I"
 */
function chunkSyllabus(text, metadata) {
  // TODO Phase 3: refine regex after inspecting real RGPV syllabus PDFs
  const parts = text.split(/\bUNIT[-\s]*[0-9IVX]+\b/i);
  return makeChunks(parts, metadata);
}

/**
 * PYQ Papers: split by question number.
 * Each question is independent — enables precise retrieval.
 * Example boundaries: "Q1.", "1)", "1."
 */
function chunkPYQ(text, metadata) {
  // TODO Phase 3: refine regex after inspecting real RGPV PYQ PDFs
  const parts = text.split(/(?:^|\n)\s*(?:Q\.?\s*)?[0-9]+[.)]/m);
  return makeChunks(parts, metadata);
}

/**
 * Exam Rules / Ordinance: split by clause or paragraph.
 * Each rule is independent — prevents mixing regulations.
 */
function chunkRules(text, metadata) {
  // Split on double newlines (paragraph boundaries) or numbered clauses
  const parts = text.split(/\n\s*\n|\b(?:Clause|Article|Section)\s+[0-9]+/i);
  return makeChunks(parts, metadata);
}

/**
 * Academic Calendar: split by event/date block.
 * Each date entry is standalone.
 */
function chunkCalendar(text, metadata) {
  // Split on lines that start with a date pattern
  const parts = text.split(/\n(?=\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
  return makeChunks(parts, metadata);
}

/**
 * Fee Structure: split by fee category.
 */
function chunkFees(text, metadata) {
  const parts = text.split(/\n\s*\n/);
  return makeChunks(parts, metadata);
}

module.exports = { chunkDocument };

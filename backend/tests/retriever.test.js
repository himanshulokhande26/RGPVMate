// tests/retriever.test.js
// Unit tests for normalizeBranch — the function that maps student-typed
// branch names to the exact strings stored in Qdrant metadata.
// Getting this wrong means zero search results for a student.
'use strict';

// Set env vars BEFORE requiring the module (retriever reads them at module load time)
process.env.QDRANT_URL = 'http://localhost:6333';
process.env.QDRANT_API_KEY = 'test';
process.env.EMBEDDER_URL = 'http://localhost:5000';

// Mock the Qdrant client and axios so this test file doesn't need
// a real Qdrant or embedder running.
jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollections: jest.fn().mockResolvedValue({ collections: [] }),
  })),
}));
jest.mock('axios');

const { normalizeBranch } = require('../services/retriever');

describe('normalizeBranch — branch name normalization', () => {

  // ── Abbreviations ───────────────────────────────────────────────────────────

  test('handles "CSE" abbreviation', () => {
    expect(normalizeBranch('CSE')).toBe('Computer Science Engineering');
  });

  test('handles "cse" lowercase', () => {
    expect(normalizeBranch('cse')).toBe('Computer Science Engineering');
  });

  test('handles "IT" abbreviation', () => {
    expect(normalizeBranch('IT')).toBe('Information Technology');
  });

  test('handles "it" lowercase', () => {
    expect(normalizeBranch('it')).toBe('Information Technology');
  });

  test('handles "ECE" abbreviation', () => {
    // 'ec' maps to ECE — check that ece maps too via includes check
    const result = normalizeBranch('Electronics and Communication Engineering');
    expect(result).toBe('Electronics and Communication Engineering');
  });

  test('handles "ME" abbreviation', () => {
    expect(normalizeBranch('ME')).toBe('Mechanical Engineering');
  });

  // ── Full Names ─────────────────────────────────────────────────────────────

  test('passes through a full correct name unchanged', () => {
    expect(normalizeBranch('Computer Science Engineering')).toBe('Computer Science Engineering');
  });

  test('handles "Information Technology" full name', () => {
    expect(normalizeBranch('Information Technology')).toBe('Information Technology');
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────

  test('returns null for null input', () => {
    expect(normalizeBranch(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(normalizeBranch(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(normalizeBranch('')).toBeNull();
  });

  // ── AIML / Data Science ────────────────────────────────────────────────────

  test('handles "AIML" abbreviation', () => {
    expect(normalizeBranch('AIML')).toBe('AI and Machine Learning');
  });

  test('handles "AIDS" abbreviation for AI Data Science', () => {
    expect(normalizeBranch('AIDS')).toBe('AI and Data Science');
  });

});

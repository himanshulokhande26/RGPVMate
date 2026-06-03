// tests/cache.test.js
// Unit tests for the cache key normalization logic.
// This is the most critical function in cache.js — a bug here causes
// students to receive each other's cached answers (BUG-4, now fixed).
'use strict';

const { normalizeKey } = require('../services/cache');

describe('normalizeKey — cache key generation', () => {

  // ── Basic normalization ─────────────────────────────────────────────────────

  test('lowercases the question', () => {
    const key = normalizeKey('What Is Machine Learning?', {});
    expect(key).toMatch(/what is machine learning/);
  });

  test('strips punctuation from the question', () => {
    const key = normalizeKey('What is CS-601?!!', {});
    expect(key).not.toMatch(/[?!-]/);
  });

  test('collapses multiple spaces into one', () => {
    const key = normalizeKey('what   is    OS', {});
    // Key format: "program:branch:semester:question" — take last segment after final ':'
    const questionPart = key.split(':').pop();
    expect(questionPart).toBe('what is os');
  });

  // ── Context isolation (the core correctness guarantee) ──────────────────────

  test('two students with different branches get DIFFERENT cache keys for the same question', () => {
    const question = 'what are the subjects this semester';
    const cseKey = normalizeKey(question, { branch: 'Computer Science Engineering', semester: 5, program: 'B.Tech' });
    const eceKey = normalizeKey(question, { branch: 'Electronics and Communication Engineering', semester: 5, program: 'B.Tech' });

    expect(cseKey).not.toBe(eceKey);
  });

  test('two students with different semesters get DIFFERENT cache keys for the same question', () => {
    const question = 'what are the subjects this semester';
    const sem5Key = normalizeKey(question, { branch: 'Computer Science Engineering', semester: 5, program: 'B.Tech' });
    const sem7Key = normalizeKey(question, { branch: 'Computer Science Engineering', semester: 7, program: 'B.Tech' });

    expect(sem5Key).not.toBe(sem7Key);
  });

  test('same student asking same question twice gets the SAME cache key', () => {
    const ctx = { branch: 'Computer Science Engineering', semester: 5, program: 'B.Tech' };
    const key1 = normalizeKey('What is OS?', ctx);
    const key2 = normalizeKey('What is OS?', ctx);

    expect(key1).toBe(key2);
  });

  test('question with different punctuation but same meaning gets the same key', () => {
    const ctx = { branch: 'CSE', semester: 5 };
    const key1 = normalizeKey('What is OS?', ctx);
    const key2 = normalizeKey('What is OS', ctx);

    expect(key1).toBe(key2);
  });

  test('no context still produces a valid key (guest users)', () => {
    const key = normalizeKey('what is quicksort', {});
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

});

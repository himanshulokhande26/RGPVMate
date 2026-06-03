// tests/chat.integration.test.js
// Integration tests for POST /api/chat
// All external services (Qdrant, Groq, MongoDB, embedder) are mocked
// so tests run completely offline — no API keys or running services needed.
'use strict';

// ── Mock all external services BEFORE requiring the app ────────────────────
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_unit_tests';
process.env.QDRANT_URL = 'http://localhost:6333';
process.env.QDRANT_API_KEY = 'test';
process.env.GROQ_API_KEY = 'test_groq_key';
process.env.EMBEDDER_URL = 'http://localhost:5000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/rgpvmate_test';
process.env.ADMIN_PASSWORD = 'test_admin_password';

// Mock Qdrant client
jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollections: jest.fn().mockResolvedValue({ collections: [{ name: 'rgpvmate_docs' }] }),
    search: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({ status: 'ok' }),
  })),
}));

// Mock axios (used by embedder calls)
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { vector: new Array(384).fill(0.1) } }),
  get: jest.fn().mockResolvedValue({ data: {} }),
  create: jest.fn().mockReturnThis(),
  defaults: { headers: { common: {} } },
}));

// Mock mongoose so we don't need a real MongoDB
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(undefined),
    model: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ _id: 'mock_id' }),
      find: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockResolvedValue(0),
    }),
    Schema: actual.Schema,
    connection: { readyState: 1 },
  };
});

const request = require('supertest');
const app = require('../index');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/chat — input validation', () => {

  test('returns 400 when question is missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({})
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/required/i);
  });

  test('returns 400 when question is empty string', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: '   ' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
  });

  test('returns 400 when question exceeds 2000 characters', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'x'.repeat(2001) })
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  test('returns 400 when semester is invalid (e.g. 99)', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'What is OS?', semester: 99 })
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/semester/i);
  });

  test('returns 400 when program is not in the allowed list', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'What is OS?', program: 'InvalidDegree' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/program/i);
  });

  test('returns 400 when history is not an array', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'What is OS?', history: 'not an array' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/array/i);
  });

  test('returns 200 with valid minimal payload (greeting fast-path)', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'hi' })
      .set('Accept', 'application/json');

    // Greeting is handled by fast-path — returns 200 without hitting any external API
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('answer');
    expect(typeof res.body.answer).toBe('string');
    expect(res.body.answer.length).toBeGreaterThan(0);
  });

  test('returns 200 for "who are you" — self intro fast-path', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'who are you' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/RGPVMate/i);
  });

});

describe('GET /health', () => {
  test('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

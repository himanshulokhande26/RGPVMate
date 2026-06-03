// ─────────────────────────────────────────────────────────────
// RGPVMate Backend — Express Entry Point
// ─────────────────────────────────────────────────────────────
'use strict';

const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const mongoose   = require('mongoose');
const passport   = require('./config/passport');
const rateLimit  = require('express-rate-limit');

const chatRoutes    = require('./routes/chat');
const authRoutes    = require('./routes/auth');
const threadsRoutes = require('./routes/threads');
const adminRoutes   = require('./routes/admin');
const noticesRoutes = require('./routes/notices');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'https://rgpvmate.vercel.app',
  ],
  credentials: true,
}));

// ── Body Parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// ── Rate Limiting ─────────────────────────────────────────────
// Protects Groq API quota from being drained by bots or abusive users.
// Chat: 20 messages/minute per IP — generous for real students, blocks spam.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute window
  max: 20,                  // max 20 requests per window per IP
  standardHeaders: true,    // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    answer: "⏳ You're sending messages too fast! Please slow down and try again in a moment.",
    sources: [],
    rateLimited: true,
  },
  skip: () => process.env.NODE_ENV === 'test', // don't rate-limit during tests
});

// Auth: 10 attempts per 15 minutes per IP — prevents password brute-force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 10,                  // max 10 login/register attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'rgpvmate-backend', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/chat',         chatLimiter,  chatRoutes);
app.use('/api/chat/threads', threadsRoutes);
app.use('/api/auth',         authLimiter,  authRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/notices',      noticesRoutes);

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────
// In production: never expose internal error messages (file paths, stack traces).
// In development: show full message for easier debugging.
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error. Please try again.' : err.message,
  });
});

// ── MongoDB + Server Start ─────────────────────────────────────
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.warn('⚠️  MongoDB connection failed — running without DB:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 RGPVMate backend running on http://localhost:${PORT}`);
    console.log(`📡 Embedder URL: ${process.env.EMBEDDER_URL}`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
  });
}

// Export app for integration tests (jest + supertest)
module.exports = app;

startServer();

// routes/auth.js — Google OAuth 2.0 + JWT
// Full implementation: Phase 5
'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');

// Lazy-init passport strategy when MongoDB is ready (Phase 5)
// GET /api/auth/google — redirect to Google consent screen
router.get('/google', (req, res, next) => {
  // TODO Phase 5: passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
  res.json({ message: 'Google OAuth coming in Phase 5' });
});

// GET /api/auth/google/callback — handle OAuth redirect
router.get('/google/callback', (req, res, next) => {
  // TODO Phase 5: exchange code for profile, create user, issue JWT
  res.json({ message: 'Google OAuth callback coming in Phase 5' });
});

// GET /api/auth/me — return current user info from JWT
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const user = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;

// middleware/authGuard.js
// Verifies JWT for protected routes.
// optionalAuth — attaches req.user if token present, but doesn't block if missing
// requireAuth  — blocks unauthenticated requests with 401
'use strict';

const jwt = require('jsonwebtoken');

/**
 * Extracts and verifies JWT from Authorization header.
 * Attaches decoded user to req.user if valid.
 */
function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split(' ')[1];
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * optionalAuth — use on routes that work for both guests AND logged-in users.
 * Example: POST /api/chat (guests can chat, logged-in users get history saved)
 */
function optionalAuth(req, res, next) {
  req.user = verifyToken(req) || null;
  next();
}

/**
 * requireAuth — use on routes that need a logged-in user.
 * Example: GET /api/history
 */
function requireAuth(req, res, next) {
  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

module.exports = { optionalAuth, requireAuth };

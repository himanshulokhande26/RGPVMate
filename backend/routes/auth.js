// routes/auth.js — Email/Password Auth + Google OAuth stub
'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const passport = require('../config/passport');
const User     = require('../models/User');
const Thread   = require('../models/Thread');
const Message  = require('../models/Message');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret_key';
const JWT_EXPIRY = '30d';

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function publicUser(user) {
  return {
    id:         user._id,
    name:       user.name,
    email:      user.email,
    program:    user.program,
    branch:     user.branch,
    semester:   user.semester,
    systemType: user.systemType,
    photoUrl:   user.photoUrl || user.picture || null,
    isOAuth:    !!user.googleId,
    createdAt:  user.createdAt,
  };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, program, branch, semester } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name:     name.trim(),
      email:    email.toLowerCase(),
      password: hash,
      program:  program  || 'B.Tech',
      branch:   branch   || 'Computer Science Engineering',
      semester: semester  ? Number(semester) : 1,
    });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });

  } catch (err) {
    console.error('[auth/register]', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.password) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Please use Google to log in.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });

  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Calculate stats
    let totalMessages = 0;
    const userIdStr = req.user.googleId || req.user.id;
    const threads = await Thread.find({ userId: userIdStr }).select('_id');
    if (threads.length > 0) {
      const threadIds = threads.map(t => t._id);
      totalMessages = await Message.countDocuments({ threadId: { $in: threadIds }, role: 'user' });
    }

    res.json({ user: publicUser(user), stats: { totalMessages } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, program, branch, semester, photoUrl } = req.body;
    const updates = {};
    if (name)     updates.name     = name.trim();
    if (program)  updates.program  = program;
    if (branch)   updates.branch   = branch;
    if (semester) updates.semester = Number(semester);
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });

  } catch (err) {
    console.error('[auth/profile]', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── PUT /api/auth/password ────────────────────────────────────────────────────
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Both old and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Password change is not available for OAuth accounts' });
    }

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password updated successfully' });

  } catch (err) {
    console.error('[auth/password]', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ── Google OAuth ──────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth?error=oauth_failed` }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/callback?token=${token}`);
  }
);

// ── GitHub OAuth ──────────────────────────────────────────────
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback', 
  passport.authenticate('github', { session: false, failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth?error=oauth_failed` }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/callback?token=${token}`);
  }
);

module.exports = router;

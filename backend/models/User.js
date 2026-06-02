// models/User.js — MongoDB schema for RGPV students
'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────────────
  googleId:  { type: String, sparse: true, index: true },  // only for OAuth users
  githubId:  { type: String, sparse: true, index: true },  // GitHub OAuth users
  email:     { type: String, required: true, unique: true, lowercase: true },
  name:      { type: String, required: true },
  password:  { type: String },          // bcrypt hash — only for email/password accounts
  picture:   { type: String },          // Google profile photo URL (OAuth users)
  photoUrl:  { type: String },          // User-uploaded / custom photo URL

  // ── Academic Context ──────────────────────────────────────────
  program:   { type: String, default: 'B.Tech' }, // B.Tech | BE | M.Tech | MCA | MBA | Diploma | …
  branch:    { type: String, default: 'Computer Science Engineering' },
  semester:  { type: Number, default: 1, min: 1, max: 10 },
  systemType:{ type: String },          // e.g. CBCS | CBGS | Grading System — optional

  // ── Meta ──────────────────────────────────────────────────────
  createdAt: { type: Date, default: Date.now },
  // NEVER store: Google access token, raw passwords, sensitive data
});

module.exports = mongoose.model('User', userSchema);

// models/User.js — MongoDB schema for RGPV students
'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId:  { type: String, required: true, unique: true, index: true },
  email:     { type: String, required: true },
  name:      { type: String, required: true },
  picture:   { type: String },           // Google profile photo URL
  branch:    { type: String, default: 'CSE' }, // student preference
  semester:  { type: Number, default: 1, min: 1, max: 8 },
  createdAt: { type: Date, default: Date.now },
  // NEVER store: password, Google access token, sensitive data
});

module.exports = mongoose.model('User', userSchema);

// models/ChatHistory.js — Stores Q&A pairs for logged-in users
// Cap: last 50 conversations per user — older ones auto-deleted on save
'use strict';

const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true }, // googleId
  question:  { type: String, required: true },
  answer:    { type: String, required: true },
  sources:   [{ type: String }],          // source PDF filenames cited
  semester:  { type: Number },
  branch:    { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Auto-delete oldest entries when user exceeds 50 messages
chatHistorySchema.statics.saveAndCap = async function (data) {
  const ChatHistory = this;
  const entry = await ChatHistory.create(data);

  // Count total entries for this user
  const count = await ChatHistory.countDocuments({ userId: data.userId });

  // If over 50, delete the oldest ones
  if (count > 50) {
    const oldest = await ChatHistory
      .find({ userId: data.userId })
      .sort({ createdAt: 1 })
      .limit(count - 50)
      .select('_id');

    await ChatHistory.deleteMany({ _id: { $in: oldest.map(e => e._id) } });
  }

  return entry;
};

module.exports = mongoose.model('ChatHistory', chatHistorySchema);

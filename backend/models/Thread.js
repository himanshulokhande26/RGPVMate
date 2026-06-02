const mongoose = require('mongoose');

const threadSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // googleId or local id
  title:  { type: String, required: true },              // First query or summary
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Thread', threadSchema);

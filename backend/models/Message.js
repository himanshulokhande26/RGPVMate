const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thread', required: true, index: true },
  role:     { type: String, enum: ['user', 'assistant'], required: true },
  content:  { type: String, required: true },
  sources:  [{ type: String }],
  createdAt:{ type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);

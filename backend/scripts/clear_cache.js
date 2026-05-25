// scripts/clear_cache.js
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Clearing response_cache collection...");
  await mongoose.connection.db.collection('response_cache').deleteMany({});
  console.log("✅ Response cache cleared successfully!");
  process.exit(0);
}

run().catch(err => {
  console.error("❌ Failed to clear cache:", err);
  process.exit(1);
});

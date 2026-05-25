// scripts/create_indices.js
require('dotenv').config();
const { QdrantClient } = require('@qdrant/js-client-rest');

const COLLECTION_NAME = 'rgpvmate_docs';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  port: process.env.QDRANT_URL.startsWith('https') ? 443 : undefined,
});

async function run() {
  console.log(`Connecting to Qdrant Cloud at ${process.env.QDRANT_URL}...`);
  
  try {
    // 1. Create index for 'semester' (integer)
    console.log("Creating payload index for 'semester' (integer)...");
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'semester',
      field_schema: 'integer',
      wait: true,
    });
    console.log("✅ 'semester' index created!");

    // 2. Create index for 'branch' (keyword)
    console.log("Creating payload index for 'branch' (keyword)...");
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'branch',
      field_schema: 'keyword',
      wait: true,
    });
    console.log("✅ 'branch' index created!");

    // 3. Create index for 'type' (keyword)
    console.log("Creating payload index for 'type' (keyword)...");
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'type',
      field_schema: 'keyword',
      wait: true,
    });
    console.log("✅ 'type' index created!");

    // 4. Create index for 'systemType' (keyword)
    console.log("Creating payload index for 'systemType' (keyword)...");
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'systemType',
      field_schema: 'keyword',
      wait: true,
    });
    console.log("✅ 'systemType' index created!");

    console.log("\n══════════════════════════════════════════════");
    console.log("🎉 All payload indexes created successfully!");
    console.log("══════════════════════════════════════════════");

  } catch (err) {
    console.error("❌ Failed to create indexes:", err.message);
  }
}

run();

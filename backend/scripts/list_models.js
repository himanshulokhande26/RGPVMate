// scripts/list_models.js
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  console.log("Listing available models for your API key...");
  try {
    // List models using the Google GenAI SDK
    // The SDK provides a listModels method or we can call the API directly.
    // Let's use standard fetch/axios to query the models list endpoint directly,
    // which is the most reliable way to inspect the raw API response!
    const axios = require('axios');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await axios.get(url);
    console.log("✅ Successfully retrieved models list:\n");
    response.data.models.forEach(model => {
      console.log(`  • Name: ${model.name}`);
      console.log(`    Supported methods: ${model.supportedGenerationMethods.join(', ')}`);
      console.log(`    Description: ${model.description}\n`);
    });
  } catch (err) {
    console.error("❌ Failed to list models:");
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

run();

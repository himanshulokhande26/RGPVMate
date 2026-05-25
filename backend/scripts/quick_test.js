// scripts/quick_test.js — Non-interactive API test
// Tests a battery of question types and prints the results
'use strict';

const http = require('http');

const BASE_URL = 'http://localhost:3000';

const TESTS = [
  // Test 1: Broad semester syllabus query
  { label: '📚 Broad Semester Syllabus', question: 'what are the subjects in cse 6th sem', branch: 'Computer Science Engineering', semester: 6 },
  // Test 2: Specific subject code unit-wise syllabus
  { label: '📖 Specific Subject Syllabus', question: 'give me the unit wise syllabus of CS601', branch: 'Computer Science Engineering', semester: 6 },
  // Test 3: General academic concept (Tutorial Mode)
  { label: '🧠 Academic Concept (Tutorial Mode)', question: 'what is a compiler?', branch: 'Computer Science Engineering', semester: 6 },
  // Test 4: Chitchat
  { label: '💬 Chitchat', question: 'how are you doing today?' },
  // Test 5: RGPV admin query
  { label: '🏫 RGPV Admin Query', question: 'what is the minimum passing percentage in RGPV?' },
  // Test 6: Follow-up context test
  { label: '🔗 Follow-up context (yes)', question: 'yes', history: [
    { role: 'user', content: 'what are the subjects in ME 4th sem?' },
    { role: 'assistant', content: 'Here are the subjects in ME 4th sem... Would you like detailed unit-wise syllabus?' }
  ]},
];

async function callAPI(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Failed to parse JSON: ${data}`)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  RGPVMate Quick Test Suite — gemini-1.5-flash ');
  console.log('══════════════════════════════════════════════\n');

  for (const test of TESTS) {
    console.log(`\n┌─ ${test.label}`);
    console.log(`│  Q: ${test.question}`);
    
    try {
      const payload = { question: test.question };
      if (test.branch) payload.branch = test.branch;
      if (test.semester) payload.semester = test.semester;
      if (test.history) payload.history = test.history;

      const result = await callAPI(payload);
      
      if (result.error) {
        console.log(`│  ❌ Error: ${result.error}`);
      } else {
        const answerPreview = (result.answer || '').replace(/\n/g, '\n│  ').substring(0, 600);
        console.log(`│  ✅ [${result.elapsedSeconds}s] Answer:\n│  ${answerPreview}`);
        if (result.sources && result.sources.length > 0) {
          console.log(`│  📎 Sources: ${result.sources.join(', ')}`);
        }
      }
    } catch(err) {
      console.log(`│  ❌ Request failed: ${err.message}`);
    }
    console.log('└──────────────────────────────────────────────');
    
    // Small delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n✅ All tests done.\n');
}

runTests().catch(console.error);

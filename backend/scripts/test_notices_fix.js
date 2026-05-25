// scripts/test_notices_fix.js
'use strict';

const axios = require('axios');
const url = 'http://localhost:3000/api/chat';

async function runTests() {
  console.log('🚀 Running Notice and Source Suppression Verification Tests...\n');

  const testCases = [
    {
      name: 'Notice Query (Should bypass filters & return notice info and RGPV_Notice source if found)',
      payload: {
        question: 'What is the most recent notice regarding college enrollment?',
        semester: 4,
        branch: 'Information Technology'
      }
    },
    {
      name: 'Denial Query (Should suppress sources completely when refusing/denying information)',
      payload: {
        question: 'tell me about the latest notice released by rgpv regarding alien invasion?',
        semester: 4,
        branch: 'Information Technology'
      }
    },
    {
      name: 'Hinglish Denial Query (Should suppress sources completely when denying in Hinglish/Hindi)',
      payload: {
        question: 'rgpv ka alien invasion wala latest notice batao ?',
        semester: 4,
        branch: 'Information Technology'
      }
    }
  ];

  for (const tc of testCases) {
    console.log(`=========================================`);
    console.log(`CASE: ${tc.name}`);
    console.log(`Query: "${tc.payload.question}" (branch: ${tc.payload.branch}, sem: ${tc.payload.semester})`);
    console.log(`=========================================`);

    try {
      const start = Date.now();
      const res = await axios.post(url, tc.payload);
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);

      console.log(`🤖 Answer: \n${res.data.answer}`);
      console.log(`\n⏱️  Time: ${elapsed}s`);
      console.log(`📚 Sources Cited:`, res.data.sources);
      console.log(`-----------------------------------------\n`);
    } catch (err) {
      console.error('❌ Error calling API:', err.response ? err.response.data : err.message);
      console.log(`-----------------------------------------\n`);
    }
  }
}

runTests();

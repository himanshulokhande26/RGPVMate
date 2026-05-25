// scripts/test_chat_rag.js
const axios = require('axios');
const readline = require('readline');

const url = 'http://localhost:3000/api/chat';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function startInteractiveChat() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('         Welcome to the RGPVMate Interactive CLI Chat Client!     ');
  console.log('══════════════════════════════════════════════════════════════════\n');

  // 1. Get Branch
  console.log('💡 RGPV Branch examples: "Computer Science Engineering", "Information Technology", etc.');
  const branchInput = await askQuestion('👉 Enter your branch (or press Enter to skip): ');
  const branch = branchInput.trim() || undefined;

  // 2. Get Semester
  const semInput = await askQuestion('👉 Enter your semester (1-8, or press Enter to skip): ');
  const semester = semInput.trim() ? Number(semInput.trim()) : undefined;

  console.log('\n✅ Filters established!');
  if (branch) console.log(`   • Branch  : ${branch}`);
  if (semester) console.log(`   • Semester: ${semester}`);
  console.log('──────────────────────────────────────────────────────────────────\n');

  // 3. Chat Loop
  const chatHistory = [];

  while (true) {
    const questionInput = await askQuestion('💬 Student Question (or type "exit" / "quit" to leave): ');
    
    const question = questionInput.trim();
    if (!question) continue;
    
    if (question.toLowerCase() === 'exit' || question.toLowerCase() === 'quit') {
      console.log('\n👋 Thank you for using RGPVMate! Closing CLI client.\n');
      rl.close();
      break;
    }

    console.log('\n🤖 Thinking (Retrieving + Embedding + LLM Generation)... \n');

    try {
      const startTime = Date.now();

      const response = await axios.post(url, {
        question,
        semester,
        branch,
        history: chatHistory
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('══════════════════════════════════════════════════════════════════');
      console.log('🤖 RGPVMate Response:');
      console.log('══════════════════════════════════════════════════════════════════');
      console.log(response.data.answer);
      console.log(`\n⏱️  Response Time: ${elapsed}s`);
      if (response.data.sources && response.data.sources.length > 0) {
        console.log('📚 Sources Cited:');
        response.data.sources.forEach(src => console.log(`  • ${src}`));
      }
      console.log('══════════════════════════════════════════════════════════════════\n');

      // Append to local history for follow-ups
      chatHistory.push({ role: 'user', content: question });
      chatHistory.push({ role: 'assistant', content: response.data.answer });

      // Cap at last 6 messages (3 full turns) to keep query condensation extremely precise
      if (chatHistory.length > 6) {
        chatHistory.shift(); // Remove oldest user message
        chatHistory.shift(); // Remove oldest assistant response
      }

    } catch (err) {
      // Handle 429 quota exceeded — show clean message, NOT raw JSON
      const is429 = err.response?.status === 429 || (err.message && err.message.includes('429'));
      if (is429) {
        const retryMatch = (JSON.stringify(err.response?.data || '') + err.message).match(/retry in (\d+(\.\d+)?)s/i);
        const retrySecs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
        console.log('══════════════════════════════════════════════════════════════════');
        console.log('⚠️  RGPVMate is rate-limited:');
        console.log('══════════════════════════════════════════════════════════════════');
        console.log(`☕ I've hit my API request limit. Please wait ~${retrySecs}s and try again.`);
        console.log('──────────────────────────────────────────────────────────────────\n');
      } else {
        console.log('❌ Error:');
        if (err.response) {
          console.log(`   Status: ${err.response.status}`);
          console.log(`   Details:`, JSON.stringify(err.response.data, null, 2));
        } else {
          console.log(`   Message: ${err.message}`);
        }
        console.log('──────────────────────────────────────────────────────────────────\n');
      }
    }

  }
}

startInteractiveChat().catch(err => {
  console.error('💥 Fatal Client Error:', err.message);
  rl.close();
});

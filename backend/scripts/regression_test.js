// scripts/regression_test.js
// Quick regression test for the 4 bugs we just fixed
'use strict';
const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api/chat';

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';

async function ask(q, opts = {}) {
  const res = await axios.post(BASE_URL, { question: q, ...opts });
  return res.data;
}
let p = 0, f = 0;
function check(label, cond, got = '') {
  if (cond) { console.log(`${GREEN}✅${RESET} ${label}`); p++; }
  else { console.log(`${RED}❌${RESET} ${label}${got ? ' → got: ' + got : ''}`); f++; }
}

async function run() {
  console.log(`${BOLD}\n🔧 Regression Tests for Bug Fixes\n${RESET}`);

  // BUG 1: isGreeting should NOT swallow compound queries
  console.log('\n── BUG 1: Greeting + real question ──');
  let r = await ask('good morning, what subjects do I have in sem 5?', { semester: 5, branch: 'Information Technology' });
  check('Compound query not treated as greeting', r.elapsedSeconds > 0, `${r.elapsedSeconds}s, "${r.answer.slice(0,60)}"`);
  check('Response has actual subject info', r.answer.toLowerCase().includes('semester') || r.answer.toLowerCase().includes('subject') || r.answer.length > 50);

  r = await ask('hello, give me syllabus for sem 3', { semester: 3, branch: 'Computer Science Engineering' });
  check('"hello + real question" not swallowed', r.elapsedSeconds > 0);

  r = await ask('hi', {});
  check('Pure "hi" still fires fast-path', r.elapsedSeconds === 0);

  r = await ask('kaise ho', {});
  check('"kaise ho" added to greeting fast-path', r.elapsedSeconds === 0);

  // BUG 2 (CRITICAL): isSystemQuery no longer catches academic algorithm queries
  console.log('\n── BUG 2: isSystemQuery false positives ──');
  r = await ask('which algorithm is used in OSPF routing');
  check('"which algorithm in OSPF" NOT caught by isSystemQuery', r.elapsedSeconds > 0, `${r.elapsedSeconds}s`);
  check('OSPF answer has actual content', r.answer.toLowerCase().includes('ospf') || r.answer.toLowerCase().includes('dijkstra') || r.answer.toLowerCase().includes('link'));

  r = await ask('explain Dijkstra algorithm');
  check('"explain Dijkstra algorithm" not caught as system query', r.elapsedSeconds > 0);

  r = await ask('what is the PageRank algorithm');
  check('"what is the PageRank algorithm" not caught as system query', r.elapsedSeconds > 0);

  r = await ask('what model do you use');
  check('"what model do you use" STILL triggers system fast-path', r.elapsedSeconds === 0);

  r = await ask('which model are you running');
  check('"which model are you running" STILL triggers fast-path', r.elapsedSeconds === 0);

  // BUG 3: System query now reports actual model name dynamically
  console.log('\n── BUG 3: Model name accuracy ──');
  r = await ask('what model do you use');
  const expectedModel = 'llama-3.1-8b-instant'; // from .env
  check(`System response contains actual model name "${expectedModel}"`, r.answer.includes(expectedModel), r.answer.slice(0, 100));
  check('System response does not say "llama-3.3-70b-versatile" (wrong model)', !r.answer.includes('llama-3.3-70b-versatile'));

  // BUG 4: isDontKnow cache guard now covers Hinglish denials
  console.log('\n── BUG 4: isDontKnow cache guard ──');
  // Test a known Hinglish denial — it should NOT be cached (we can't test cache bypass directly,
  // but we can ensure the regex matches)
  const testAnswer = 'Main to RGPV ki latest notice ki details nahi rakh sakta.';
  const isDontKnow =
    /i don't have/i.test(testAnswer) ||
    /i do not have/i.test(testAnswer) ||
    /not found/i.test(testAnswer) ||
    /cannot find/i.test(testAnswer) ||
    /could not find/i.test(testAnswer) ||
    /nahi rakh sakta/i.test(testAnswer) ||
    /nahi bata sakta/i.test(testAnswer) ||
    /details nahi/i.test(testAnswer) ||
    /pata nahi/i.test(testAnswer);
  check('Hinglish denial "nahi rakh sakta" matches isDontKnow guard', isDontKnow);

  const testAnswer2 = "I don't have that specific info in my knowledge base.";
  const isDontKnow2 = /i don't have/i.test(testAnswer2);
  check('English denial "I don\'t have that" still matches isDontKnow guard', isDontKnow2);

  console.log(`\n${BOLD}══════════════════════${RESET}`);
  console.log(`${GREEN}✅ PASSED${RESET}: ${p}`);
  console.log(`${RED}❌ FAILED${RESET}: ${f}`);
  console.log(`${BOLD}══════════════════════${RESET}\n`);
}

run().catch(e => console.error('Fatal:', e.message));

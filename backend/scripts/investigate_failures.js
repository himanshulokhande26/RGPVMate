// scripts/investigate_failures.js
// Investigates the 2 failures found in comprehensive test
'use strict';
const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api/chat';

async function ask(question, opts = {}) {
  const { semester, branch, history } = opts;
  const res = await axios.post(BASE_URL, { question, semester, branch, history });
  return res.data;
}

async function run() {
  console.log('\n====== FAILURE INVESTIGATION ======\n');

  // ── FAILURE 1: 413 on "kaise ho yaar" ──────────────────────────────────────
  console.log('--- FAILURE 1: "kaise ho yaar" returned 413 ---');
  console.log('This was cached from a prior very large response.');
  console.log('Testing with cache busted (slightly different phrasing):');
  try {
    const r = await ask('kaise ho bhai');
    console.log('Response:', r.answer.slice(0, 200));
    console.log('Sources:', r.sources);
    console.log('elapsedSeconds:', r.elapsedSeconds);
  } catch (e) {
    const status = e.response?.status;
    const data = e.response?.data;
    console.log(`ERROR ${status}:`, JSON.stringify(data || e.message));
    console.log('LIKELY CAUSE: Cached answer in MongoDB exceeded 10MB JSON body limit.');
    console.log('NOTE: The test used "kaise ho yaar" previously with a very large answer body.');
  }

  // ── FAILURE 2: "any announcements about exams" — doesn't cite RGPV_Notice ─
  console.log('\n--- FAILURE 2: "any announcements about exams" ---');
  console.log('Testing: do "announcements" trigger notice filter?');
  try {
    const r = await ask('any announcements about exams', { semester: 5, branch: 'Computer Science Engineering' });
    console.log('Answer:', r.answer.slice(0, 300));
    console.log('Sources:', JSON.stringify(r.sources));
    const triggeredNotice = r.sources.includes('RGPV_Notice');
    console.log('Cited RGPV_Notice:', triggeredNotice);
    if (!triggeredNotice) {
      console.log('ANALYSIS: "announcements" matched isNoticeQuery but the LLM may have produced');
      console.log('an "exam" content response, which triggers hasRGPVContent=true but source may');
      console.log('be from exam/syllabus docs, not RGPV_Notice. Source filter inconsistency.');
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  // ── EDGE CASE: Movie recommendation gives actual recommendation (hallucination) ─
  console.log('\n--- EDGE CASE: Movie recommendation ─ checks if it actually recommended a movie ---');
  try {
    const r = await ask('recommend a movie');
    console.log('Answer:', r.answer.slice(0, 400));
    if (r.answer.toLowerCase().includes('interstellar') || r.answer.toLowerCase().includes('3 idiots') || r.answer.toLowerCase().includes('inception')) {
      console.log('⚠️  ISSUE: Bot actually recommended a movie name instead of redirecting.');
    } else {
      console.log('✅ Bot redirected without recommending a specific movie.');
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  // ── EDGE CASE: "good morning" with a question appended ─────────────────────
  console.log('\n--- EDGE CASE: "good morning, what subjects do I have in sem 5?" ---');
  try {
    const r = await ask('good morning, what subjects do I have in sem 5?', { semester: 5, branch: 'Information Technology' });
    console.log('elapsedSeconds:', r.elapsedSeconds);
    console.log('Answer snippet:', r.answer.slice(0, 200));
    if (r.elapsedSeconds === 0) {
      console.log('⚠️  ISSUE: Greeting fast-path triggered even though user had a real question attached.');
    } else {
      console.log('✅ Real question was processed correctly.');
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  // ── EDGE CASE: Cache serving stale answers ─────────────────────────────────
  console.log('\n--- EDGE CASE: Does cache bypass isDenial check? ---');
  console.log('When a denial is cached, it should NOT be served from cache (isDontKnow check in chat.js).');
  console.log('Current isDontKnow in chat.js only checks: "i don\'t have that" OR "I do not have that information"');
  console.log('But the denial in llm.js can vary widely (e.g. "nahi rakh sakta", "not found").');
  console.log('RISK: Those varied denials may get CACHED due to isDontKnow being too narrow.');

  // ── EDGE CASE: "ok" could swallow a real question ──────────────────────────
  console.log('\n--- EDGE CASE: Single-word "ok" at the start of a sentence ---');
  try {
    const r = await ask('ok give me sem 5 it syllabus');
    console.log('elapsedSeconds:', r.elapsedSeconds);
    console.log('Answer snippet:', r.answer.slice(0, 150));
    if (r.elapsedSeconds === 0) {
      console.log('⚠️  ISSUE: "ok give me sem 5..." caught by isAcknowledgment because of the word "ok" at start.');
    }
  } catch(e) {
    console.log('ERROR:', e.message);
  }

  // ── EDGE CASE: "nice" (acknowledgment) vs "nice explain quicksort" ─────────
  console.log('\n--- EDGE CASE: "nice, explain quicksort" ─ should NOT be caught as acknowledgment ---');
  try {
    const r = await ask('nice, explain quicksort');
    console.log('elapsedSeconds:', r.elapsedSeconds);
    if (r.elapsedSeconds === 0) {
      console.log('⚠️  ISSUE: "nice, explain quicksort" treated as acknowledgment and ignored.');
    } else {
      console.log('✅ Processed as a real question.');
      console.log('Answer snippet:', r.answer.slice(0, 100));
    }
  } catch(e) {
    console.log('ERROR:', e.message);
  }

  // ── EDGE CASE: "model" keyword in non-system context ────────────────────────
  console.log('\n--- EDGE CASE: "what is the Entity Relationship model" ─ should NOT trigger isSystemQuery ---');
  try {
    const r = await ask('what is the entity relationship model');
    console.log('elapsedSeconds:', r.elapsedSeconds);
    if (r.elapsedSeconds === 0) {
      console.log('⚠️  ISSUE: ER model question caught by isSystemQuery due to "model" keyword!');
      console.log('Answer:', r.answer.slice(0, 120));
    } else {
      console.log('✅ ER model treated as a real academic query.');
      console.log('Answer snippet:', r.answer.slice(0, 120));
    }
  } catch(e) {
    console.log('ERROR:', e.message);
  }

  // ── EDGE CASE: "algorithm" in isSystemQuery ──────────────────────────────
  console.log('\n--- EDGE CASE: "which algorithm is used in OSPF" ─ should NOT trigger isSystemQuery ---');
  try {
    const r = await ask('which algorithm is used in OSPF routing');
    console.log('elapsedSeconds:', r.elapsedSeconds);
    if (r.elapsedSeconds === 0) {
      console.log('⚠️  ISSUE: "which algorithm" caught by isSystemQuery!');
      console.log('Answer:', r.answer.slice(0, 120));
    } else {
      console.log('✅ OSPF algorithm treated as real academic query.');
      console.log('Answer snippet:', r.answer.slice(0, 120));
    }
  } catch(e) {
    console.log('ERROR:', e.message);
  }

  console.log('\n====== INVESTIGATION COMPLETE ======\n');
}

run().catch(console.error);

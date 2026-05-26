// routes/chat.js — POST /api/chat
// Phase 5: Groq LLM + MongoDB response cache
'use strict';

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authGuard');
const { getEmbedding, searchChunks } = require('../services/retriever');
const { generateAnswer, condenseQuestion } = require('../services/llm');
const { getCached, setCached } = require('../services/cache');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User');

// ── Sanitizer: strips LLM-injected Source lines from answer text ─────────────
function sanitizeAnswer(text) {
  return (text || '')
    .replace(/^[ \t]*\*{0,2}sources?\*{0,2}:[^\n]*/gim, '')
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<script>/gi, '')
    .replace(/<\/script>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Local response helpers: zero API cost for purely deterministic queries ────

function isGreeting(text) {
  const clean = text.toLowerCase().trim().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '').replace(/\s+/g, ' ');
  // Guard: if more than 6 words, it's a compound query — never a pure greeting
  if (clean.split(' ').length > 6) return false;
  const singleWord = /^(hi+|hello+|hey+|yo+|helo+|sup+|greetings+|namaste|heyy+|hii+|wassup+|whatsapp+|hola+|aloha+|salaam+|kaise\s*ho|kaise\s*hai|kaisa\s*hai)$/i;
  const multiWord = [
    'good morning', 'good afternoon', 'good evening', 'good night',
    'hey there', 'hello mate', 'hello buddy', 'hi bro', 'hey bro', 'heyy bro', 'hello bro',
    'hi mate', 'hey mate', 'yo bro', 'yo mate', 'sup bro', 'sup mate', 'hii bro', 'hey buddy',
    'kaise ho', 'kaise hai', 'kaisa hai', 'kya haal', 'kya haal hai', 'hows it going'
  ];
  const hinges = /^(kaise\s*ho|kaise\s*hai|kaisa\s*hai|kya\s*haal|kya\s*haal\s*hai)\s*(yaar|bhai|bro|buddy|mate|dost)?$/i;
  return singleWord.test(clean) || multiWord.includes(clean) || hinges.test(clean) || /^(hi|hey|hello|yo)\s+(bro|buddy|mate|friend|yaar|there)$/i.test(clean);
}

function isSelfIntroQuery(text) {
  return /^(who are you|what are you|what is your name|what'?s your name|tell me about yourself|what can you do|introduce yourself|are you (a )?bot|are you ai|are you human)/i.test(text.trim());
}

function isSystemQuery(text) {
  const t = text.toLowerCase().trim();
  const hasArchitecture = /architect|archit|acrhit|archic/i.test(t);
  const hasSystem = /\b(system|backend|tech|database|vector|qdrant|stack|model|api|key|credentials|secret)\b/i.test(t);

  // Specific key queries that look for RGPVMate's internal keys
  const isInternalKeyQuery = 
    /\b(your|this|using|used|groq|gemini|system|secret)\s+(api\s*key|token|key\b)/i.test(t) ||
    /\b(api\s*key|token|key\b).*\b(your|this|using|used|groq|gemini|system|secret)\b/i.test(t) ||
    /^(show|give|tell|reveal)\s+(me\s+)?(the\s+)?(api\s*)?key/i.test(t);

  // CRITICAL FIX: "which model/llm/ai" must be about RGPVMate itself, not academic topics.
  const isModelQuery =
    /\b(what|which)\s+(model|llm)\b/i.test(t) ||
    /\b(what|which)\s+ai\s+(model|engine|are\s+you|do\s+you)\b/i.test(t) ||
    /\byou\s+(use|run|using|running)\s+(model|llm|ai|api)\b/i.test(t);

  return (
    (hasSystem && hasArchitecture) ||
    isInternalKeyQuery ||
    isModelQuery ||
    /\b(system|backend|tech|software|database|vector|qdrant)\s+(stack|details|specifications)\b/i.test(t) ||
    /\b(how|on\s+what)\s+(principle|mechanism)\s+(you|do\s+you)\s+work\b/i.test(t) ||
    /\bhow\s+(do\s+you|you)\s+work\b/i.test(t) ||
    /\b(who|which\s+company)\s+(created|built|designed|developed|programmed|coder)\s+you\b/i.test(t) ||
    /\b(your|tell\s+me\s+your)\s+(stack|technology|model|backend)\b/i.test(t)
  );
}

function isAcknowledgment(text) {
  const t = text.trim();
  const positive = /^(thank(s| you)?|thx|ty|got it|okay|ok|alright|sounds good|perfect|great|awesome|nice|cool|sure|np|no problem|understood|haan|bilkul)[.!]?$/i;
  const negative = /^(no|nope|nah|nahi|na|not now|not really|no thanks|no thank you|nothing else|that's it|no i'm good|no im good|nothing|no more|none)[.!,]?$/i;
  return positive.test(t) || negative.test(t);
}
// NOTE: isOffTopic removed — Groq handles casual/off-topic naturally via system prompt.

// POST /api/chat
// Body: { question: string, semester?: number, branch?: string, history?: object[] }
router.post('/', optionalAuth, async (req, res, next) => {
  const apiStart = Date.now();
  try {
    const { question, semester, branch, history } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const q = question.trim();

    // ── LOCAL FAST-PATH BYPASSES (0 API calls) ────────────────────────────────

    if (isGreeting(q)) {
      return res.json({
        answer: "Hey! \uD83D\uDC4B Great to see you! I'm RGPVMate \u2014 your RGPV study companion. What can I help you with today? Syllabus, subjects, exams? \uD83D\uDCDA",
        sources: [], elapsedSeconds: 0,
      });
    }

    if (isSelfIntroQuery(q)) {
      return res.json({
        answer: "I'm **RGPVMate** 🤖 — an AI assistant built for RGPV students!\n\nI can help you with:\n\n- 📚 **Syllabus** (unit-wise breakdown for any subject)\n- 📋 **Scheme details** (credits, contact hours, electives)\n- 🧠 **Academic concepts** (definitions, explanations, tutorials)\n- 🏫 **RGPV info** (exam patterns, passing criteria, etc.)\n\nWhat would you like to explore?",
        sources: [], elapsedSeconds: 0,
      });
    }

    if (isSystemQuery(q)) {
      const activeModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      return res.json({
        answer: `Bro!! That's a bit personal, can't tell you all my secrets! 😉 But I'm built using Node.js, Express, Qdrant, and Groq (running **${activeModel}**) to help you crack those exams. Ask me about your subjects, syllabus, or notes instead! 📚`,
        sources: [], elapsedSeconds: 0,
      });
    }

    if (isAcknowledgment(q)) {
      const isNegative = /^(no|nope|nah|nahi|na|not now|not really|no thanks|no thank you|nothing else|that's it|no i'm good|no im good|nothing|no more|none)[.!,]?$/i.test(q);
      return res.json({
        answer: isNegative
          ? "No worries! \uD83D\uDE0A Just come back whenever you need help with something."
          : "Happy to help! \uD83D\uDE0A Ask me anything about your subjects, syllabus, or RGPV anytime.",
        sources: [], elapsedSeconds: 0,
      });
    }

    // ── Cache Lookup (before embedding + Groq call) ───────────────────────────
    const cached = await getCached(q);
    if (cached) {
      const elapsedSeconds = Number(((Date.now() - apiStart) / 1000).toFixed(2));
      return res.json({ ...cached, answer: sanitizeAnswer(cached.answer), elapsedSeconds, fromCache: true });
    }

    // ── Conversational Memory (Query Condensation — LOCAL, 0 API calls) ───────
    let condensedQuestion = q;
    if (history && history.length > 0) {
      condensedQuestion = condenseQuestion(q, history);
    }
    console.log('\uD83D\uDD04 [chat] Condensed Query: "' + condensedQuestion + '"');

    // ── Dynamic Filter Resolution ─────────────────────────────────────────────
    let activeSemester   = undefined;
    let activeBranch     = undefined;
    let activeSystemType = undefined;

    const qLower = condensedQuestion.toLowerCase();

    // 1. Extract semester from query text
    const semMatch = qLower.match(/(?:sem|semester|std)\s*([1-8])\b/) || qLower.match(/\b([1-8])(?:st|nd|rd|th)?\s*(?:sem|semester)\b/);
    if (semMatch) {
      activeSemester = Number(semMatch[1]);
      console.log('\uD83C\uDFAF [chat] Semester from query: ' + activeSemester);
    }

    // 2. Extract semester from subject code (e.g. CS601 -> sem 6)
    if (!activeSemester) {
      const codeMatch = qLower.match(/\b[a-z]{2,5}\s*-?\s*([1-8])\d{2}\b/);
      if (codeMatch) {
        activeSemester = Number(codeMatch[1]);
        console.log('\uD83C\uDFAF [chat] Semester from subject code: ' + activeSemester);
      }
    }

    // 3. Extract branch from query
    if (/\b(cse|computer\s*science(?:\s*engineering)?)\b/.test(qLower)) {
      activeBranch = 'Computer Science Engineering';
    } else if (/\bcs\s*(?:\d|sem|branch|dept|engineer)/.test(qLower)) {
      activeBranch = 'Computer Science Engineering';
    } else if (/\b(information\s*tech(?:nology)?|\bit\s*(?:sem|branch|dept|\d))/.test(qLower)) {
      activeBranch = 'Information Technology';
    } else if (/\b(ece|electronics\s*(?:and\s*)?communication)\b/.test(qLower)) {
      activeBranch = 'Electronics and Communication Engineering';
    } else if (/\b(eee|electrical\s*and\s*electronics)\b/.test(qLower)) {
      activeBranch = 'Electrical and Electronics Engineering';
    } else if (/\b(electrical\s*engineering|\bee\s*(?:sem|branch|dept|\d))/.test(qLower)) {
      activeBranch = 'Electrical Engineering';
    } else if (/\b(mechanical\s*engineering|mech\b|\bme\s*(?:sem|branch|dept|\d|6th|7th|8th|1st|2nd|3rd|4th|5th))/.test(qLower)) {
      activeBranch = 'Mechanical Engineering';
    } else if (/\b(civil\s*engineering|\bce\s*(?:sem|branch|dept|\d))/.test(qLower)) {
      activeBranch = 'Civil Engineering';
    }
    if (activeBranch) console.log('\uD83C\uDFAF [chat] Branch from query: "' + activeBranch + '"');

    // 4. Extract system type from query
    if (/\bcbgs\b/.test(qLower)) {
      activeSystemType = 'CBGS';
    } else if (/\bcbcs\b/.test(qLower)) {
      activeSystemType = 'CBCS';
    } else if (/\b(non\s*grading|old\s*scheme)\b/.test(qLower)) {
      activeSystemType = 'Non Grading System';
    } else if (/\b(grading|aicte|btech|b\.tech)\b/.test(qLower)) {
      activeSystemType = 'Grading System';
    }

    // 5. Fallback to onboarding body params
    if (!activeSemester) activeSemester = semester ? Number(semester) : undefined;
    if (!activeBranch)   activeBranch   = branch || undefined;

    // 6. Fallback to logged-in user profile
    if (req.user && (!activeSemester || !activeBranch || !activeSystemType)) {
      try {
        const profile = await User.findOne({ googleId: req.user.googleId });
        if (profile) {
          if (!activeSemester)   activeSemester   = profile.semester;
          if (!activeBranch)     activeBranch     = profile.branch;
          if (!activeSystemType) activeSystemType = profile.systemType;
        }
      } catch (dbErr) {
        console.warn('\u26A0\uFE0F [chat] Profile fetch failed (guest mode):', dbErr.message);
      }
    }

    if (!activeSystemType) activeSystemType = 'Grading System';

    console.log('\uD83D\uDD04 [chat] Filters: sem=' + activeSemester + ', branch="' + activeBranch + '", type="' + activeSystemType + '"');

    // ── Step 1: Embed condensed question ─────────────────────────────────────
    const isBroadQuery = qLower.includes('syllabus') || qLower.includes('subjects') || qLower.includes('courses');
    const isPyqQuery = qLower.includes('pyq') || qLower.includes('previous year') || qLower.includes('old paper') || qLower.includes('question paper') || qLower.includes('exam paper');
    const isNoticeQuery = /\b(notice|notices|announcement|announcements|circular|circulars|notification|notifications|latest\s+update|new\s+update)\b/i.test(qLower);
    const topK = isPyqQuery ? 12 : (isBroadQuery || isNoticeQuery ? 5 : 4);
    const searchLimit = isPyqQuery ? 30 : topK;

    // Extract subject keywords & codes for PYQ chunk re-ranking
    let queryNumber = null;
    let queryKeywords = [];
    if (isPyqQuery) {
      const numberMatch = condensedQuestion.match(/\b\d{3,4}\b/);
      queryNumber = numberMatch ? numberMatch[0] : null;

      const stopWords = new Set([
        'what', 'give', 'list', 'rank', 'pyq', 'pyqs', 'question', 'questions', 'paper', 'papers',
        'semester', 'sem', 'subject', 'subjects', 'order', 'frequency', 'top', 'first',
        'the', 'and', 'for', 'this', 'that', 'with', 'about', 'how', 'why', 'can', 'you', 'please',
        'arranged', 'arrange', 'sorted', 'sort', 'most', 'asked', 'least', 'showing', 'show',
        'display', 'displaying', 'priority', 'based', 'from', 'chunks', 'of', 'in', 'your'
      ]);
      queryKeywords = condensedQuestion.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !stopWords.has(w) && isNaN(w));
      console.log('🔑 [chat] Extracted PYQ search keywords:', queryKeywords, 'number:', queryNumber);
    }

    console.log('\uD83D\uDD04 [chat] Fetching embedding...');
    const vector = await getEmbedding(condensedQuestion);

    // ── Step 2: Retrieve chunks from Qdrant ───────────────────────────────────
    const filters = {};
    if (isNoticeQuery) {
      filters.type = 'notice';
    } else if (isPyqQuery) {
      // NOTE: Do NOT filter PYQs by branch — all ingested PYQs carry CSE metadata
      // regardless of branch. The keyword re-ranker handles subject relevance.
      filters.type = 'pyq';
    } else {
      if (activeSemester)   filters.semester   = activeSemester;
      if (activeBranch)     filters.branch     = activeBranch;
      if (activeSystemType) filters.systemType = activeSystemType;
    }

    console.log('\uD83D\uDD04 [chat] Querying Qdrant...');
    let chunks = await searchChunks(vector, filters, searchLimit);
    console.log('\uD83D\uDD04 [chat] Retrieved ' + chunks.length + ' chunks');

    // Self-healing: retry without branch/semester if empty
    if (chunks.length === 0 && (filters.branch || filters.semester || filters.type)) {
      console.log('\u26A0\uFE0F [chat] 0 results with filters. Retrying broad search...');
      let fallbackFilters = {};
      if (isNoticeQuery) {
        fallbackFilters = { type: 'notice' };
      } else if (isPyqQuery) {
        fallbackFilters = { type: 'pyq' };
      } else if (filters.systemType) {
        fallbackFilters = { systemType: filters.systemType };
      }
      chunks = await searchChunks(vector, fallbackFilters, searchLimit);
      console.log('\uD83D\uDD04 [chat] Broad search: ' + chunks.length + ' chunks');
    }

    // ── Step 2.5: Re-rank PYQ chunks using keyword-matching scores ───────────
    if (isPyqQuery && chunks.length > 0) {
      console.log('🔄 [chat] Re-ranking ' + chunks.length + ' PYQ chunks based on keywords...');
      const scoredChunks = chunks.map(chunk => {
        let score = chunk.distance ? (1 - chunk.distance) : 0.5; // Cosine similarity
        const sourceLower = (chunk.metadata.source || '').toLowerCase();

        // 1. Subject code match bonus
        if (queryNumber && sourceLower.includes(queryNumber)) {
          score += 2.0;
        }

        // 2. Keyword matches bonus
        let keywordMatches = 0;
        queryKeywords.forEach(kw => {
          if (sourceLower.includes(kw)) keywordMatches++;
        });
        score += keywordMatches * 0.5;

        // 3. IT-branch alias: IT/it subject codes share papers with CSE/CD naming
        //    e.g. "IT501" → also match cs-5... cd-... prefixes in filenames
        if (activeBranch === 'Information Technology') {
          if (sourceLower.includes('_it_') || sourceLower.includes('-it-')) score += 0.8;
          // IT papers often appear in CSE/CD/AIML folders
          if (queryNumber && (sourceLower.includes('cs-' + queryNumber.slice(1)) ||
              sourceLower.includes('cd-' + queryNumber.slice(1)))) score += 1.0;
        }

        return { chunk, score };
      });

      // Sort descending by score
      scoredChunks.sort((a, b) => b.score - a.score);

      // Slice to topK (15)
      chunks = scoredChunks.slice(0, topK).map(sc => sc.chunk);
      console.log('🎯 [chat] Re-ranked top 3 sources:', chunks.slice(0, 3).map(c => c.metadata.source));
    }

    // ── Step 3: Generate answer via Groq ─────────────────────────────────────
    console.log('\uD83D\uDD04 [chat] Generating answer via Groq (' + (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile') + ')...');
    const { answer, sources } = await generateAnswer(condensedQuestion, chunks);
    console.log('\uD83D\uDD04 [chat] Answer length=' + answer.length + ', sources=' + sources.length);

    // ── Step 4: Save to cache (fire-and-forget, skip denial/"no info" answers) ──
    // Synced with isDenial patterns in llm.js to prevent caching any denial variant
    const isDontKnow =
      /i don't have/i.test(answer) ||
      /i do not have/i.test(answer) ||
      /not found/i.test(answer) ||
      /cannot find/i.test(answer) ||
      /could not find/i.test(answer) ||
      /nahi rakh sakta/i.test(answer) ||
      /nahi bata sakta/i.test(answer) ||
      /details nahi/i.test(answer) ||
      /pata nahi/i.test(answer);
    if (answer && !isDontKnow) {
      setCached(q, answer, sources).catch(() => {});
    }

    // ── Step 5: Save to chat history (logged-in users only) ───────────────────
    if (req.user) {
      ChatHistory.saveAndCap({
        userId:   req.user.googleId,
        question: q,
        answer,
        sources,
        semester: activeSemester,
        branch:   activeBranch,
      }).catch(err => console.error('[chat] History save failed:', err.message));
    }

    // ── Step 6: Return to client ──────────────────────────────────────────────
    const elapsedSeconds = Number(((Date.now() - apiStart) / 1000).toFixed(2));
    res.json({ answer: sanitizeAnswer(answer), sources, elapsedSeconds });

  } catch (err) {
    console.error('💥 [chat] Error caught in route:', err);
    // Friendly 429 handler
    if (err.status === 429 || (err.message && err.message.includes('429'))) {
      return res.status(429).json({
        answer: "\u2615 I've hit my API limit for now. Please wait a minute and try again!",
        sources: [],
        elapsedSeconds: Number(((Date.now() - apiStart) / 1000).toFixed(2)),
        rateLimited: true,
      });
    }
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Embedder service unavailable. Make sure the Python embedder is running.' });
    }
    next(err);
  }
});

module.exports = router;

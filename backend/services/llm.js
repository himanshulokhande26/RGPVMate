// services/llm.js
// LLM inference via Groq API (llama-3.3-70b-versatile)
// Groq free tier: 14,400 req/day — ~720x more than Gemini free tier
'use strict';

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Parse multiple API keys (comma-separated) or fallback to single key
const apiKeys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const clients = apiKeys.map(key => new Groq({ apiKey: key }));
let currentClientIndex = 0;

if (clients.length === 0) {
  console.warn('⚠️ No GROQ_API_KEY or GROQ_API_KEYS defined in .env!');
}
console.log(`🔑 Groq: ${clients.length} API key(s) loaded. Rotation: ${clients.length > 1 ? 'enabled' : 'disabled (single key)'}`);

// Gemini fallback — used only when ALL Groq keys are rate-limited (429)
const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
if (geminiClient) {
  console.log('✅ Gemini fallback API: ready (activates only when all Groq keys are exhausted)');
} else {
  console.warn('⚠️ GEMINI_API_KEY not set — no fallback if all Groq keys are rate-limited');
}

const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
// Token cap per chunk: prevents one huge PYQ PDF chunk from blowing up the payload.
// 1200 chars ≈ 300 tokens — generous for context but safe under Groq's 8K limit per message.
const MAX_CHUNK_CHARS = parseInt(process.env.MAX_CHUNK_CHARS || '1200', 10);

// ── Patterns for local context extraction (no API calls needed) ──────────────
const SEM_PATTERNS = [
  /(?:sem|semester|std)\s*([1-8])\b/i,
  /\b([1-8])(?:st|nd|rd|th)?\s*(?:sem|semester)\b/i,
];
const BRANCH_MAP = [
  { regex: /\b(cse|computer\s*science(?:\s*engineering)?)\b/i, value: 'Computer Science Engineering' },
  { regex: /\b(it|information\s*tech(?:nology)?)\b/i, value: 'Information Technology' },
  { regex: /\b(ece|electronics\s*(?:and\s*)?communication)\b/i, value: 'Electronics and Communication Engineering' },
  { regex: /\b(eee|electrical\s*and\s*electronics)\b/i, value: 'Electrical and Electronics Engineering' },
  { regex: /\b(electrical\s*engineering)\b/i, value: 'Electrical Engineering' },
  { regex: /\b(mechanical\s*engineering|mech\b)\b/i, value: 'Mechanical Engineering' },
  { regex: /\b(civil\s*engineering)\b/i, value: 'Civil Engineering' },
];
const SUBJECT_CODE_RE = /\b([A-Z]{2,5}\s*-?\s*[1-8]\d{2})\b/i;
const PRONOUN_RESOLVE_WORDS = /\b(it|they|that|this|those|these|the subject|the course|them)\b/i;

/**
 * LOCAL (zero-API-cost) question condensation.
 * Extracts key entities from recent history and injects missing context.
 * No API call — pure regex.
 */
function condenseQuestion(question, history) {
  if (!history || history.length === 0) return question;

  const q = question.trim();

  let ctxSemester = null;
  let ctxBranch = null;
  let ctxSubjectCode = null;
  let ctxSubjectName = null;

  for (const msg of history.slice(-6)) {
    const text = msg.content || '';

    if (!ctxSemester) {
      for (const pat of SEM_PATTERNS) {
        const m = text.match(pat);
        if (m) { ctxSemester = m[1]; break; }
      }
    }
    if (!ctxBranch) {
      for (const { regex, value } of BRANCH_MAP) {
        if (regex.test(text)) { ctxBranch = value; break; }
      }
    }
    if (!ctxSubjectCode) {
      const m = text.match(SUBJECT_CODE_RE);
      if (m) ctxSubjectCode = m[1].toUpperCase().replace(/\s/g, '');
    }
    if (!ctxSubjectName) {
      const m = text.match(/(?:syllabus|topics?|units?|notes?)\s+(?:of|for)\s+([A-Za-z][A-Za-z\s]{3,30})/i);
      if (m) ctxSubjectName = m[1].trim();
    }
  }

  let condensed = q;

  const hasPronouns = PRONOUN_RESOLVE_WORDS.test(q);
  if (hasPronouns && (ctxSubjectCode || ctxSubjectName)) {
    condensed = condensed.replace(PRONOUN_RESOLVE_WORDS, ctxSubjectCode || ctxSubjectName);
  }

  const hasSem = SEM_PATTERNS.some(p => p.test(condensed));
  if (!hasSem && ctxSemester) condensed = condensed + ' (semester ' + ctxSemester + ')';

  const hasBranch = BRANCH_MAP.some(({ regex }) => regex.test(condensed));
  if (!hasBranch && ctxBranch) condensed = condensed + ' (' + ctxBranch + ')';

  const isConfirmation = /^(yes|yeah|yep|sure|ok|okay|please|go ahead|show me|give me|yup|haan|ha|haa)\b/i.test(condensed.trim());
  if (isConfirmation && ctxSubjectCode) {
    condensed = 'Give me the detailed unit-wise syllabus for ' + ctxSubjectCode;
    if (ctxBranch && !condensed.includes(ctxBranch)) condensed += ' (' + ctxBranch + ')';
    if (ctxSemester && !condensed.includes('semester')) condensed += ' semester ' + ctxSemester;
  } else if (isConfirmation && ctxSubjectName) {
    condensed = 'Give me the detailed unit-wise syllabus for ' + ctxSubjectName;
    if (ctxBranch && !condensed.includes(ctxBranch)) condensed += ' (' + ctxBranch + ')';
    if (ctxSemester && !condensed.includes('semester')) condensed += ' semester ' + ctxSemester;
  }

  if (condensed !== q) {
    console.log('\uD83D\uDD04 [Query Condensation \u2014 LOCAL] "' + q + '" \u2192 "' + condensed + '"');
  }
  return condensed;
}

// ── System Prompt (stored as array to avoid backtick escaping issues) ────────
const SYSTEM_PROMPT_LINES = [
  'You are RGPVMate \u2014 a smart, helpful, and highly professional AI assistant built for RGPV (Rajiv Gandhi Proudyogiki Vishwavidyalaya) students.',
  'Think of yourself as a knowledgeable, cool college senior who gives clear, beautifully structured answers without ever being rigid or lecturing.',
  '',
  '## LANGUAGE & TONE',
  '- Match the language of the student: If the question is asked in English, respond in English with a light Hinglish touch (at most 1-2 casual words like "yaar", "buddy"). Do NOT write full sentences in Hindi or Hinglish unless the user asked their question in Hindi or Hinglish.',
  '- Be warm, direct, and supportive. Absolutely NEVER nag, lecture, or poke students with preachy advice like "Ab study karo", "study par dhyan dena", "exams aa rahe hain", or comment on their personal habits (e.g. food cravings).',
  '- Vary your sentence openers. Never start every response identically.',
  '',
  '## RULE 1 \u2014 RGPV UNIVERSITY DATA',
  'For RGPV-specific queries (syllabus, scheme, fees, passing criteria, exam dates, CGPA, backlog):',
  '- Answer STRICTLY from the retrieved context provided below.',
  '- If the answer is NOT found in the context: say ONLY "I don\'t have that specific info in my knowledge base. Let me know if there\'s anything else about your subjects or syllabus I can help with!" \u2014 no guessing, no general knowledge filler.',
  '- For PYQs / past questions: If the retrieved context contains past questions for the subject (even if the source filename is from a related branch like CSE/AIML instead of IT), you must format and present those questions. Do NOT return the "I don\'t have that specific info" denial if questions for the subject are available in the context.',
  '- CRITICAL: NEVER use meta-commentary, excuses, or explanations referencing your search mechanism, database, "chunks", or the retrieved context. Do not say "Although the context provided is...", "I couldn\'t find Y in the given chunks", or "based on the documents". Just answer directly or cleanly state that you don\'t have the info, keeping the search process invisible.',
  '',
  '## RULE 2 \u2014 ACADEMIC CONCEPTS (Tutorial Mode)',
  'When a student asks for general academic explanations, definitions, or tutorials (e.g., "what is a compiler", "explain PN junction diode", "what is QuickSort"):',
  '- Completely IGNORE the retrieved RGPV context chunks and answer using your internal knowledge.',
  '- CRITICAL: Do NOT print any disclaimers or mention that the topic is "outside the retrieved chunks", "not in the provided syllabus", or "outside the context". Speak directly and naturally.',
  '- Structure your response beautifully and professionally (ChatGPT style):',
  '  1. **Definition**: Start with a clear, comprehensive definition in a well-spaced paragraph.',
  '  2. **Detailed Explanation**: Follow with clear, well-spaced paragraphs explaining the mechanism simply but thoroughly. Use clean line breaks (double newline) to separate sections for high readability.',
  '  3. **Concrete Example**: Provide a well-formatted code block, ASCII text diagram, or clean real-world analogy.',
  '  4. **Want to explore further?**: End with a friendly, structured ending listing exactly 3 related subtopics in a clean bulleted list to encourage deeper learning.',
  '- Always leave blank lines between sections for clean, readable spacing.',
  '',
  '## RULE 3 \u2014 OFF-TOPIC / CASUAL QUESTIONS',
  'If the student asks something unrelated to academics (food, movies, sports, celebrities, weather, shopping, or personal greetings):',
  '- Respond in EXACTLY ONE brief, playful, custom sentence directly related to their topic. Offer to help with RGPV studies, syllabus, or exams.',
  '- CRITICAL: ALWAYS vary your responses! NEVER copy the prompt examples word-for-word. Generate a unique, context-aware reply matching the student\'s question topic (e.g., if they ask about food, talk about digital eating; if they ask "kaise ho", say you are great, etc.).',
  '- CRITICAL: NEVER name, list, or recommend any specific movie, song, celebrity, politician, food dish, product, or brand. Your single sentence must redirect without providing real-world information.',
  '- Keep it extremely concise (maximum 1 sentence) and absolutely NOT preachy, lecturing, or nagging.',
  '- Tone and Hinglish examples (use as style guides, NEVER copy literally):',
  '  * Food (English query): "Haha, I\'m a digital assistant yaar, I don\'t eat food! 😂 Let me know if you need help with your RGPV studies or syllabus instead!"',
  '  * Food (Hinglish query): "Haha, main to digital insaan hoon yaar, khaana thodi khaata hoon! 😂 RGPV studies ya syllabus mein help chahiye ho to batao!"',
  '  * General greeting (e.g. kaise ho): "Mast yaar! Main badhiya hoon. RGPVMate bolte hain mujhe, exams ki tyaari kaisi chal rahi hai? 😉"',
  '  * Movies: "Oh, sounds fun yaar! But movies are outside my zone — want help with syllabus or notes instead? 🎬"',
  '  * Celebrity: "Haha, I only know about RGPV exams, not famous people! Want syllabus help instead? 😄"',
  '  * Chitchat: "I\'m just an AI buddy built for your studies! Let me know if you need syllabus, credits, or notes help. 👍"',
  '',
  '## RULE 4 \u2014 FORMATTING (ALWAYS follow this)',
  '- Use **bold** for subject codes, names, and key terms.',
  '- Use numbered lists for syllabus units.',
  '- Use bullet points (\u2022) for subject lists.',
  '- Leave a blank line between sections for readability.',
  '- Do NOT add any "Source:" or "Reference:" lines \u2014 handled by the system.',
  '- CRITICAL: When listing past questions (PYQs), do NOT include the PDF source filenames (e.g., "RGPV_PYQ_...") or source titles in the main body of the response. Only output the plain question text, its frequency, or years. The system displays cited sources separately.',
  '',
  '## RULE 5 \u2014 SYLLABUS FLOW',
  '- Semester overview: List subjects as "\u2022 **CODE** \u2014 Subject Name (X credits)". End with: "Want the unit-wise syllabus for any of these? Just say the subject name or code!"',
  '- Unit-wise detail: Give full Unit I\u2013V breakdown with topics and reference books. Leave a blank line between each unit.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_LINES.join('\n');

/**
 * Generates a grounded answer using retrieved chunks as context.
 * Uses Groq (llama-3.3-70b-versatile) — 14,400 req/day free.
 */
async function generateAnswer(question, chunks) {
  // Trim each chunk to MAX_CHUNK_CHARS to prevent payload bloat (biggest 413 cause)
  const contextBlock = chunks
    .map((chunk, i) => {
      const trimmed = chunk.text.length > MAX_CHUNK_CHARS
        ? chunk.text.slice(0, MAX_CHUNK_CHARS) + ' […]'
        : chunk.text;
      return '[Chunk ' + (i + 1) + ' — Source: ' + chunk.metadata.source + ']\n' + trimmed;
    })
    .join('\n\n');

  const userMessage = [
    'CONTEXT (retrieved from RGPV documents):',
    contextBlock || 'No relevant context found.',
    '',
    'STUDENT QUESTION:',
    question,
  ].join('\n');

  let completion = null;
  let attempts = 0;
  const maxAttempts = clients.length || 1;
  // Track which key index we started on for proper round-robin after success
  const startIndex = currentClientIndex;

  while (attempts < maxAttempts) {
    try {
      const currentClient = clients[currentClientIndex];
      if (!currentClient) {
        throw new Error('No Groq clients initialized');
      }

      // Use fewer tokens for tutorial/casual queries (they never need long answers)
      const isTutorialOrCasual = /\b(what is|explain|how to|how does|define|tutorial)\b/i.test(question)
        && !/\b(syllabus|scheme|passing|fee|exams?|notices?|announcements?)\b/i.test(question);

      completion = await currentClient.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.55,
        max_tokens: isTutorialOrCasual ? 700 : 1024,
      });

      // Advance to the next key for true round-robin (so no single key bears all load)
      currentClientIndex = (currentClientIndex + 1) % clients.length;
      break; // Success! Exit retry loop
    } catch (err) {
      const is429 = err.status === 429 || (err.message && err.message.includes('429'));
      if (is429 && clients.length > 1 && attempts < maxAttempts - 1) {
        attempts++;
        const prevIndex = currentClientIndex;
        currentClientIndex = (currentClientIndex + 1) % clients.length;
        console.warn(`⚠️ Groq Key #${prevIndex + 1}/${clients.length} rate limited (429). Rotating to Key #${currentClientIndex + 1}... (Attempt ${attempts}/${maxAttempts})`);
        continue;
      }

      // All Groq keys exhausted — try Gemini as final fallback
      if (is429 && geminiClient) {
        console.warn(`⚠️ All ${clients.length} Groq key(s) rate limited. Falling back to Gemini...`);
        try {
          const geminiModel = geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const geminiPrompt = SYSTEM_PROMPT + '\n\n' + userMessage;
          const geminiResult = await geminiModel.generateContent(geminiPrompt);
          const geminiText = geminiResult.response.text().trim();
          console.log('✅ Gemini fallback succeeded.');
          // Strip source leaks same as Groq path
          const cleanAnswer = geminiText
            .replace(/^[ \t]*\*{0,2}sources?\*{0,2}:[^\n]*/gim, '')
            .replace(/[ \t]*[([][ \t]*(?:source|sources|ref|reference|from)?[ \t]*:?[ \t]*RGPV_[A-Za-z0-9_-]+\.pdf[\])]/gi, '')
            .replace(/[ \t]*(?:- )?\b(?:source|sources|ref|reference|from)?[ \t]*:?[ \t]*RGPV_[A-Za-z0-9_-]+\.pdf\b/gi, '')
            .trim();
          // Reuse the same source-suppression logic below by setting completion-like result
          completion = { choices: [{ message: { content: cleanAnswer } }] };
          break;
        } catch (geminiErr) {
          console.error('❌ Gemini fallback also failed:', geminiErr.message);
          throw geminiErr;
        }
      }

      throw err; // Re-throw if not 429, or if both Groq and Gemini failed
    }
  }

  let answer = (completion?.choices[0]?.message?.content || '').trim()
    || 'Sorry, I could not generate a response. Please try again.';

  // Strip any LLM-injected "Source: ..." lines (we handle sources programmatically)
  answer = answer.replace(/^[ \t]*\*{0,2}sources?\*{0,2}:[^\n]*/gim, '').trim();

  // Strip any inline PDF source name leaks (e.g. (Source: RGPV_PYQ_...pdf) or (RGPV_Syllabus_...pdf))
  answer = answer.replace(/[ \t]*[([][ \t]*(?:source|sources|ref|reference|from)?[ \t]*:?[ \t]*RGPV_[A-Za-z0-9_-]+\.pdf[\])]/gi, '');
  answer = answer.replace(/[ \t]*(?:- )?\b(?:source|sources|ref|reference|from)?[ \t]*:?[ \t]*RGPV_[A-Za-z0-9_-]+\.pdf\b/gi, '');
  answer = answer.trim();

  // ── Source citation suppression ───────────────────────────────────────────
  // Only show sources for RGPV-specific academic content, not tutorials or chitchat
  const sources = [...new Set(chunks.map(c => c.metadata.source).filter(Boolean))];

  const isRGPVQuery = /\b(syllabus|scheme|schemes|subjects?|sems?|semesters?|credits?|ordinance|passing|cgpa|exams?|rgpv|btech|enroll|fees?|results?|backlogs?|grading|pyqs?|previous\s+year|old\s+paper|question\s+paper|notices?|notifications?|updates?|announcements?|circulars?)\b/i.test(question);

  const answerLower = answer.toLowerCase();
  const hasRGPVContent =
    answerLower.includes('syllabus') || answerLower.includes('scheme') ||
    answerLower.includes('unit \u2013') || answerLower.includes('unit -') ||
    answerLower.includes('ordinance') || answerLower.includes('passing') ||
    answerLower.includes('credit') || answerLower.includes('subject code') ||
    answerLower.includes('want the unit-wise') || answerLower.includes('want a detailed') ||
    answerLower.includes('pyq') || answerLower.includes('previous year') ||
    answerLower.includes('exam') || answerLower.includes('notice') ||
    answerLower.includes('announcement') || answerLower.includes('circular') ||
    answerLower.includes('published') || answerLower.includes('notification') ||
    answerLower.includes('update') || answerLower.includes('result') ||
    answerLower.includes('enrollment') || answerLower.includes('registration') ||
    answerLower.includes('timetable') || answerLower.includes('time table') ||
    answerLower.includes('schedule');

  const isDenial =
    /i don't have/i.test(answer) ||
    /i do not have/i.test(answer) ||
    /not found/i.test(answer) ||
    /no notice/i.test(answer) ||
    /cannot find/i.test(answer) ||
    /could not find/i.test(answer) ||
    /unable to find/i.test(answer) ||
    /no details/i.test(answer) ||
    /no information/i.test(answer) ||
    /nahi rakh sakta/i.test(answer) ||
    /nahi de sakta/i.test(answer) ||
    /nahi bata sakta/i.test(answer) ||
    /nahi mila/i.test(answer) ||
    /details nahi/i.test(answer) ||
    /info nahi/i.test(answer) ||
    /pata nahi/i.test(answer) ||
    /mere paas.*nahi/i.test(answer) ||
    /maaf karna/i.test(answer) ||
    /out of my zone/i.test(answer);

  const isPyq = /\b(pyq|pyqs|previous\s+year|old\s+paper|question\s+paper|exam\s+paper)\b/i.test(question);

  const suppressSources =
    !isRGPVQuery ||
    (!hasRGPVContent && !isPyq) ||
    isDenial ||
    (/\b(explain|what is|how to|how does|define|tutorial)\b/i.test(question) && !/\b(syllabus|scheme|passing|fee|exams?|dates?|notices?|announcements?|circulars?)\b/i.test(question));

  return { answer, sources: suppressSources ? [] : sources };
}

module.exports = { condenseQuestion, generateAnswer };

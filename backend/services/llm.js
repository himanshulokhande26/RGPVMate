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

// ── System Prompt (optimized v2 — anti-hallucination, structured rules) ────────────
const SYSTEM_PROMPT_LINES = [
  'You are RGPVMate \u2014 a knowledgeable, cool college senior built for RGPV (Rajiv Gandhi Proudyogiki Vishwavidyalaya) students.',
  'Give clear, beautifully structured answers without being rigid, preachy, or lecturing.',
  '',
  '## LANGUAGE & TONE',
  '- Match the student\'s language: English query \u2192 English with at most 1-2 casual Hinglish words ("yaar", "bhai"). Hindi/Hinglish query \u2192 respond naturally in Hinglish.',
  '- Be warm and direct. NEVER nag, lecture, or comment on study habits, food, or personal choices.',
  '- Vary your openers. Never start two responses the same way.',
  '',
  '## RULE 1 \u2014 RGPV DATA: STRICT GROUNDING (NO HALLUCINATION)',
  'For ANY RGPV-specific query (syllabus, scheme, credits, fees, exam dates, passing criteria, CGPA, notices, PYQs):',
  '',
  '- Treat the CONTEXT block below as the SINGLE SOURCE OF TRUTH. Your training data is irrelevant for these topics.',
  '- If the context contains the COMPLETE answer: output it fully and accurately.',
  '- If the context contains PARTIAL information (e.g., only 2 of 5 units of a syllabus):',
  '  Output exactly what IS in the context. Then write EXACTLY this line:',
  '  "\u26a0\ufe0f The remaining units are not available in my current knowledge base."',
  '  STOP there. Do NOT guess, infer, or fill gaps from your training data. Ever.',
  '- If the context contains NOTHING relevant: Reply ONLY with:',
  '  "I don\'t have that specific info in my knowledge base right now. Ask me something else about your subjects or syllabus!"',
  '- NEVER mention "chunks", "context", "retrieved documents", "my database", or any internal mechanism. The search process must be completely invisible to the user.',
  '- NEVER cite source filenames (e.g. RGPV_PYQ_CSE_CS301.pdf) in your response body.',
  '- For PYQs: if context has past questions for the subject (even from a related branch filename), format and present those questions. Do NOT deny if questions are in the context.',
  '- If context groups subjects under headers like "**Departmental Elective (Choose One):**", preserve and output these exact groupings.',
  '',
  '## RULE 2 \u2014 ACADEMIC CONCEPTS (Explanation Mode)',
  'When a student asks for general engineering explanations, definitions, or tutorials (e.g., "what is quicksort", "explain TCP/IP", "what is a compiler"):',
  '',
  '- If the CONTEXT block has relevant RGPV syllabus info for this topic, reference it to frame your answer (e.g., "As per RGPV CS-501 syllabus...").',
  '- If the CONTEXT block is not relevant to the concept being asked, use your training knowledge freely.',
  '- NEVER add disclaimers like "outside my context", "not in the syllabus", or "not in the provided chunks".',
  '- Structure your response using this exact format:',
  '',
  '  1. **Definition** \u2014 One clear, comprehensive definition paragraph.',
  '  2. **Explanation** \u2014 Clear paragraphs with blank lines between sections.',
  '  3. **Example** \u2014 A code block (for coding topics) or a concrete real-world analogy.',
  '  4. Write the exact phrase "**Want to explore further?**" on its own line.',
  '     Then list EXACTLY 3 related topic names as a Markdown bulleted list.',
  '     CRITICAL — Each bullet must be the topic name ONLY. NOTHING else.',
  '     ❌ WRONG (NEVER do this): "- Binary Search: A fast algorithm that divides the search space"',
  '     ❌ WRONG (NEVER do this): "- Binary Search — works by dividing the array"',
  '     ✅ CORRECT: "- Binary Search"',
  '     ✅ CORRECT: "- Hash Tables"',
  '     ✅ CORRECT: "- Sorting Algorithms"',
  '     After the topic name: no colon, no dash, no description, no sentence, no words. Just the name. Period.',
  '',
  '- Always leave blank lines between sections for clean, readable spacing.',
  '',
  '## RULE 3 \u2014 SUBJECT LISTING FORMATTING',
  'When listing subjects from the retrieved context:',
  '- Use Markdown bullet list: "- **CODE** \u2014 Subject Name (X credits)"',
  '- Preserve elective groupings exactly: if context has "Departmental Elective (Choose One)", output it as "### Departmental Elective (Choose One)".',
  '- NEVER flatten subjects into a paragraph. Each subject on its own line.',
  '- Leave a blank line before and after every list.',
  '',
  '## RULE 4 \u2014 OFF-TOPIC / CASUAL QUESTIONS',
  'If asked about food, movies, sports, celebrities, weather, shopping, or unrelated personal topics:',
  '- Reply in EXACTLY ONE short, playful sentence. Do NOT explain or list anything.',
  '- Vary the response every time. NEVER copy the examples below literally.',
  '- NEVER name any specific movie, song, celebrity, food dish, product, or brand.',
  '- Style examples (do not copy verbatim):',
  '  * Food: "Haha, digital me khaana kahan se aaye yaar \ud83d\ude02 \u2014 RGPV syllabus se kuch chahiye?"',
  '  * Movie: "Films are outside my zone \u2014 want help with your semester instead? \ud83c\udfac"',
  '  * Celebrity: "I only know RGPV toppers, not famous people! \ud83d\ude04"',
  '',
  '## RULE 5 \u2014 STRICT MARKDOWN FORMATTING (CRITICAL)',
  '- Use "- " or "* " for bullet points. NEVER use raw unicode like "\u2022".',
  '- Place every list item on its own line.',
  '- Use **bold** for subject codes, names, and key terms.',
  '- Use "1. " numbering for syllabus units.',
  '- Use "### " headings for sub-sections and categories.',
  '- Leave a completely blank line between every section, list, and paragraph.',
  '- Do NOT add any "Source:", "Reference:", or "Based on:" lines \u2014 the system handles citations.',
  '- For PYQs: output only the question text and frequency/years. No PDF filenames.',
  '',
  '## RULE 6 \u2014 SYLLABUS DISPLAY',
  '- Semester overview: List subjects as "- **CODE** \u2014 Subject Name (X credits)". End with: "Want the unit-wise syllabus for any of these? Just say the subject code!"',
  '- Unit-wise detail: Give full Unit I\u2013V breakdown with topics and reference books. Leave a blank line between each unit block.',
];

const SYSTEM_PROMPT = SYSTEM_PROMPT_LINES.join('\n');

/**
 * Generates a grounded answer using retrieved chunks as context.
 * Uses Groq (llama-3.3-70b-versatile) — 14,400 req/day free.
 */
async function generateAnswer(question, chunks, history = []) {
  // Smart truncation: rgpvnotes chunks are complete syllabuses — never truncate them.
  // PDF chunks can be 20,000+ chars — cap those at MAX_CHUNK_CHARS to avoid 413 errors.
  const contextBlock = chunks
    .map((chunk, i) => {
      const limit = chunk.metadata && chunk.metadata.isRgpvNotes ? 8000 : MAX_CHUNK_CHARS;
      const trimmed = chunk.text.length > limit
        ? chunk.text.slice(0, limit) + ' […]'
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
          ...history,
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
          const geminiPrompt = [
            SYSTEM_PROMPT,
            ...history.map(m => (m.role === 'user' ? 'STUDENT: ' : 'ASSISTANT: ') + m.content),
            userMessage
          ].join('\n\n');
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

/**
 * Streaming variant of generateAnswer — yields token chunks via async generator.
 * Used by POST /api/chat/stream (SSE endpoint) for real ChatGPT-style streaming.
 *
 * @yields {string} token — individual text chunk from the LLM
 * @returns {{ sources: string[] }} — final sources object after all tokens yielded
 */
async function* generateAnswerStream(question, chunks, history = []) {
  const contextBlock = chunks
    .map((chunk, i) => {
      const limit = chunk.metadata && chunk.metadata.isRgpvNotes ? 8000 : MAX_CHUNK_CHARS;
      const trimmed = chunk.text.length > limit
        ? chunk.text.slice(0, limit) + ' […]'
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

  const isTutorialOrCasual = /\b(what is|explain|how to|how does|define|tutorial)\b/i.test(question)
    && !/\b(syllabus|scheme|passing|fee|exams?|notices?|announcements?)\b/i.test(question);

  let fullAnswer = '';
  let attempts = 0;
  const maxAttempts = clients.length || 1;

  while (attempts < maxAttempts) {
    try {
      const currentClient = clients[currentClientIndex];
      if (!currentClient) throw new Error('No Groq clients initialized');

      const stream = await currentClient.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: userMessage },
        ],
        temperature: 0.55,
        max_tokens: isTutorialOrCasual ? 700 : 1024,
        stream: true,
      });

      currentClientIndex = (currentClientIndex + 1) % clients.length;

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullAnswer += token;
          yield token;
        }
      }
      break;
    } catch (err) {
      const is429 = err.status === 429 || (err.message && err.message.includes('429'));
      if (is429 && clients.length > 1 && attempts < maxAttempts - 1) {
        attempts++;
        currentClientIndex = (currentClientIndex + 1) % clients.length;
        console.warn(`⚠️ Stream: Groq Key rate limited. Rotating key...`);
        continue;
      }
      // Fallback to Gemini (non-streaming — emit whole answer at once)
      if (is429 && geminiClient) {
        try {
          const geminiModel = geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const geminiPrompt = [SYSTEM_PROMPT, ...history.map(m => (m.role === 'user' ? 'STUDENT: ' : 'ASSISTANT: ') + m.content), userMessage].join('\n\n');
          const result = await geminiModel.generateContent(geminiPrompt);
          fullAnswer = result.response.text().trim();
          yield fullAnswer;
          break;
        } catch (geminiErr) {
          throw geminiErr;
        }
      }
      throw err;
    }
  }

  // Clean up LLM-injected source lines
  fullAnswer = fullAnswer
    .replace(/^[ \t]*\*{0,2}sources?\*{0,2}:[^\n]*/gim, '')
    .replace(/[ \t]*[([][ \t]*(?:source|sources|ref|reference|from)?[ \t]*:?[ \t]*RGPV_[A-Za-z0-9_-]+\.pdf[\])]/gi, '')
    .trim();

  // Compute sources (reuse same suppression logic)
  const sources = [...new Set(chunks.map(c => c.metadata.source).filter(Boolean))];
  const isRGPVQuery = /\b(syllabus|scheme|subjects?|sems?|semesters?|credits?|passing|cgpa|exams?|rgpv|btech|fees?|backlogs?|pyqs?|previous\s+year|old\s+paper|question\s+paper|notices?)\b/i.test(question);
  const hasRGPVContent = /syllabus|scheme|unit|credit|subject code|pyq|previous year|exam|notice/.test(fullAnswer.toLowerCase());
  const isDenial = /i don't have|not found|cannot find|nahi bata|pata nahi/.test(fullAnswer.toLowerCase());
  const isTutorial = /\b(explain|what is|how to|how does|define|tutorial)\b/i.test(question) && !/\b(syllabus|scheme|passing|fee|exams?|notices?)\b/i.test(question);

  const suppressSources = !isRGPVQuery || (!hasRGPVContent) || isDenial || isTutorial;

  // Yield a special sentinel with metadata so the frontend knows when streaming is done
  return { sources: suppressSources ? [] : sources, fullAnswer };
}

module.exports = { condenseQuestion, generateAnswer, generateAnswerStream };


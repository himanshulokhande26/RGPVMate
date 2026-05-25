// services/llm.js
// LLM inference via Groq API (llama-3.3-70b-versatile)
// Groq free tier: 14,400 req/day — ~720x more than Gemini free tier
'use strict';

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── Patterns for local context extraction (no API calls needed) ──────────────
const SEM_PATTERNS = [
  /(?:sem|semester|std)\s*([1-8])\b/i,
  /\b([1-8])(?:st|nd|rd|th)?\s*(?:sem|semester)\b/i,
];
const BRANCH_MAP = [
  { regex: /\b(cse|computer\s*science(?:\s*engineering)?)\b/i, value: 'Computer Science Engineering' },
  { regex: /\b(it|information\s*tech(?:nology)?)\b/i,          value: 'Information Technology' },
  { regex: /\b(ece|electronics\s*(?:and\s*)?communication)\b/i, value: 'Electronics and Communication Engineering' },
  { regex: /\b(eee|electrical\s*and\s*electronics)\b/i,         value: 'Electrical and Electronics Engineering' },
  { regex: /\b(electrical\s*engineering)\b/i,                   value: 'Electrical Engineering' },
  { regex: /\b(mechanical\s*engineering|mech\b)\b/i,            value: 'Mechanical Engineering' },
  { regex: /\b(civil\s*engineering)\b/i,                        value: 'Civil Engineering' },
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

  let ctxSemester    = null;
  let ctxBranch      = null;
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
  '- Speak naturally in English. Limit Hinglish to natural terms (e.g., at most 1-2 words like "yaar", "buddy", "mast") only when it flows naturally. Do NOT write full sentences or large sections in Hinglish, EXCEPT for friendly chitchat or casual greetings, where a warm, bilingual Hinglish senior tone is highly encouraged (e.g., "Mast yaar! Main badhiya hoon. Exams ki tyaari kaisi chal rahi hai? 😉").',
  '- Be warm, direct, and supportive. Absolutely NEVER nag, lecture, or poke students with preachy advice like "Ab study karo", "study par dhyan dena", "exams aa rahe hain", or comment on their personal habits (e.g. food cravings).',
  '- Vary your sentence openers. Never start every response identically.',
  '',
  '## RULE 1 \u2014 RGPV UNIVERSITY DATA',
  'For RGPV-specific queries (syllabus, scheme, fees, passing criteria, exam dates, CGPA, backlog):',
  '- Answer STRICTLY from the retrieved context provided below.',
  '- If the answer is NOT found in the context: say ONLY "I don\'t have that specific info in my knowledge base. Let me know if there\'s anything else about your subjects or syllabus I can help with!" \u2014 no guessing, no general knowledge filler.',
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
  '- Keep it extremely concise (maximum 1 sentence) and absolutely NOT preachy, lecturing, or nagging.',
  '- Tone and Hinglish examples (use as style guides, NEVER copy literally):',
  '  * Food: "Haha, main to digital insaan hoon yaar, khaana thodi khaata hoon! 😂 RGPV studies ya syllabus mein help chahiye ho to batao!"',
  '  * General greeting (e.g. kaise ho): "Mast yaar! Main badhiya hoon. RGPVMate bolte hain mujhe, exams ki tyaari kaisi chal rahi hai? 😉"',
  '  * Movies: "Oh, I love movies! But I\'m trained for your RGPV exams \u2014 want help with syllabus or notes instead? 🎬"',
  '  * Chitchat: "I\'m just an AI buddy built for your studies! Let me know if you need syllabus, credits, or notes help. 👍"',
  '',
  '## RULE 4 \u2014 FORMATTING (ALWAYS follow this)',
  '- Use **bold** for subject codes, names, and key terms.',
  '- Use numbered lists for syllabus units.',
  '- Use bullet points (\u2022) for subject lists.',
  '- Leave a blank line between sections for readability.',
  '- Do NOT add any "Source:" or "Reference:" lines \u2014 handled by the system.',
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
  const contextBlock = chunks
    .map((chunk, i) => '[Chunk ' + (i + 1) + ' \u2014 Source: ' + chunk.metadata.source + ']\n' + chunk.text)
    .join('\n\n');

  const userMessage = [
    'CONTEXT (retrieved from RGPV documents):',
    contextBlock || 'No relevant context found.',
    '',
    'STUDENT QUESTION:',
    question,
  ].join('\n');

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
    temperature: 0.55,
    max_tokens: 1024,
  });

  let answer = (completion.choices[0]?.message?.content || '').trim()
    || 'Sorry, I could not generate a response. Please try again.';

  // Strip any LLM-injected "Source: ..." lines (we handle sources programmatically)
  answer = answer.replace(/^[ \t]*\*{0,2}sources?\*{0,2}:[^\n]*/gim, '').trim();

  // ── Source citation suppression ───────────────────────────────────────────
  // Only show sources for RGPV-specific academic content, not tutorials or chitchat
  const sources = [...new Set(chunks.map(c => c.metadata.source).filter(Boolean))];

  const isRGPVQuery = /\b(syllabus|scheme|subjects?|sem|semester|credits?|ordinance|passing|cgpa|exam|rgpv|btech|enroll|fee|result|backlog|grading)\b/i.test(question);

  const answerLower = answer.toLowerCase();
  const hasRGPVContent =
    answerLower.includes('syllabus')   || answerLower.includes('scheme')  ||
    answerLower.includes('unit \u2013') || answerLower.includes('unit -')  ||
    answerLower.includes('ordinance')  || answerLower.includes('passing')  ||
    answerLower.includes('credit')     || answerLower.includes('subject code') ||
    answerLower.includes('want the unit-wise') || answerLower.includes('want a detailed');

  const suppressSources =
    !isRGPVQuery ||
    !hasRGPVContent ||
    answer.toLowerCase().includes("i don't have that") ||
    answer.includes('I do not have that information') ||
    (/\b(explain|what is|how to|how does|define|tutorial)\b/i.test(question) && !/\b(syllabus|scheme|passing|fee|exam|date)\b/i.test(question));

  return { answer, sources: suppressSources ? [] : sources };
}

module.exports = { condenseQuestion, generateAnswer };

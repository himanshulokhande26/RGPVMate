// services/llm.js
// Builds the anti-hallucination prompt and calls Gemini 1.5 Flash.
// Full implementation: Phase 4
'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Generates a grounded answer using retrieved chunks as context.
 *
 * @param {string} question — the student's question
 * @param {{ text: string, metadata: { source: string } }[]} chunks — top-K chunks from ChromaDB
 * @returns {{ answer: string, sources: string[] }}
 */
async function generateAnswer(question, chunks) {
  // Build context block from retrieved chunks
  const contextBlock = chunks
    .map((chunk, i) =>
      `[Chunk ${i + 1} — Source: ${chunk.metadata.source}]\n${chunk.text}`
    )
    .join('\n\n');

  // ── Anti-Hallucination System Prompt ─────────────────────────
  // This is the most important line in the entire project.
  // It prevents Gemini from answering using its own training data.
  const prompt = `You are RGPVMate, an AI assistant for RGPV (Rajiv Gandhi Proudyogiki Vishwavidyalaya) students.

STRICT RULES:
1. Answer ONLY using the context provided below. Do NOT use your own training data.
2. If the answer is not found in the context, say exactly: "I do not have that information in my knowledge base."
3. Always cite the source document name at the end of your answer.
4. Answer naturally in English or Hinglish based on how the student asks.
5. Be concise and helpful. Students need quick, clear answers.

CONTEXT (retrieved from RGPV documents):
${contextBlock}

STUDENT QUESTION:
${question}

ANSWER:`;

  const result = await model.generateContent(prompt);
  const answer = result.response.text();

  // Extract unique source filenames from the chunks used
  const sources = [...new Set(chunks.map(c => c.metadata.source).filter(Boolean))];

  return { answer, sources };
}

module.exports = { generateAnswer };

// services/chunker.js
// Splits PDF text into meaningful units based on document type.
// This is the most critical design decision in the RAG pipeline.
// Full implementation: Phase 3
'use strict';

const crypto = require('crypto');

/**
 * Main entry point — routes to the correct strategy based on document type.
 * @param {string} text — raw text extracted from PDF
 * @param {string} documentType — 'syllabus' | 'pyq' | 'rules' | 'calendar' | 'fees'
 * @param {object} metadata — { source, semester, branch, subject, scheme, ... }
 * @returns {{ id: string, text: string, metadata: object }[]}
 */
function chunkDocument(text, documentType, metadata) {
  switch (documentType) {
    case 'syllabus':  return chunkSyllabus(text, metadata);
    case 'scheme':    return chunkScheme(text, metadata);
    case 'pyq':       return chunkPYQ(text, metadata);
    case 'rules':     return chunkRules(text, metadata);
    case 'calendar':  return chunkCalendar(text, metadata);
    case 'fees':      return chunkFees(text, metadata);
    default:
      throw new Error(`Unknown document type: ${documentType}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────

/** Generates a stable unique ID for a chunk */
function chunkId(source, index) {
  return crypto.createHash('md5').update(`${source}-${index}`).digest('hex');
}

/** Removes excess whitespace from a text block */
function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Wraps raw text splits into the standard chunk shape */
function makeChunks(splits, metadata) {
  return splits
    .map(clean)
    .filter(t => t.length > 50) // skip tiny fragments
    .map((text, i) => ({
      id: chunkId(metadata.source, i),
      text,
      metadata: { ...metadata },
    }));
}

// ── Chunking Strategies ───────────────────────────────────────

function chunkScheme(text, metadata) {
  const chunks = [];
  
  // 1. Keep the whole page as a single context chunk (cleansed of double spaces)
  const cleanPage = clean(text);
  if (cleanPage.length > 50) {
    chunks.push({
      id: chunkId(metadata.source, 0),
      text: `Scheme Overview:\n${cleanPage}`,
      metadata: { ...metadata, chunkType: 'overview' }
    });
  }

  // 2. Parse individual rows using the smart block-cell flowing parser
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let rowIndex = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If it's a number followed by a dot (e.g. "1.", "2.")
    if (/^\d+\.$/.test(line)) {
      const sNo = line.replace('.', '');
      
      try {
        const subjectCode = lines[++i];
        const category = lines[++i];
        
        // Accumulate subject name until we hit the marks/hours line
        // The marks/hours line contains multiple space-separated numbers or "-"
        // e.g. "70 20 10 - - 100 3 1 -" or "- - - 50 50 4"
        let subjectNameParts = [];
        let nextLine = lines[++i];
        
        while (nextLine && !/^(?:-|\d+)(?:\s+(?:-|\d+)){4,9}$/.test(nextLine)) {
          subjectNameParts.push(nextLine);
          nextLine = lines[++i];
        }
        
        const subjectName = subjectNameParts.join(' ');
        const marksHoursLine = nextLine;
        const credits = lines[++i];

        if (marksHoursLine && credits) {
          const tokens = marksHoursLine.split(/\s+/);
          // Standard RGPV columns left: L, T, P, TotalMarks, and Max Marks categories
          if (tokens.length >= 5) {
            const p = tokens.pop();
            const t = tokens.pop();
            const l = tokens.pop();
            const totalMarks = tokens.pop();
            
            // Pop practical marks
            const termWork = tokens.pop() || '-';
            const endSemPr = tokens.pop() || '-';
            
            // Pop theory marks
            const quiz = tokens.pop() || '-';
            const midSem = tokens.pop() || '-';
            const endSem = tokens.pop() || '-';

            const semanticText = `Course Scheme details for Subject Code: ${subjectCode}, Subject Name: "${subjectName}", Category: ${category}. ` +
              `Teaching Department / Hours: Lecture (L): ${l === '-' ? '0' : l}, Tutorial (T): ${t === '-' ? '0' : t}, Practical (P): ${p === '-' ? '0' : p} contact hours per week. ` +
              `Total Credits: ${credits}. ` +
              `Marks Scheme: Max Marks theory (End Sem: ${endSem === '-' ? '0' : endSem}, Mid Sem Exam: ${midSem === '-' ? '0' : midSem}, Quiz/Assignment: ${quiz === '-' ? '0' : quiz}). ` +
              `Max Marks practical (End Sem: ${endSemPr === '-' ? '0' : endSemPr}, Lab/Term Work/Sessional: ${termWork === '-' ? '0' : termWork}). ` +
              `Total Marks: ${totalMarks}. ` +
              `Program: ${metadata.program || 'N/A'}, Semester: ${metadata.semester || 'N/A'}, Scheme/Year: ${metadata.scheme || 'N/A'}.`;

            chunks.push({
              id: chunkId(metadata.source, rowIndex++),
              text: semanticText,
              metadata: { ...metadata, chunkType: 'subject_row', subjectCode, subjectName }
            });
          }
        }
      } catch (err) {
        // Fallback for this row if parsing encountered an out of bounds / layout error
        try {
          const fallbackText = `Course Scheme subject row (partial parse): "Subject S.No ${sNo} Code ${lines[i-2] || ''}". ` +
            `Program: ${metadata.program || 'N/A'}, Semester: ${metadata.semester || 'N/A'}, Scheme/Year: ${metadata.scheme || 'N/A'}.`;
          chunks.push({
            id: chunkId(metadata.source, rowIndex++),
            text: fallbackText,
            metadata: { ...metadata, chunkType: 'subject_row_raw' }
          });
        } catch (innerErr) {}
      }
    }
  }

  return chunks;
}

/**
 * Syllabus: split by UNIT heading.
 * Each unit is self-contained — clean semantic boundary.
 * Example boundary: "UNIT 1", "UNIT-1", "Unit I"
 */
function chunkSyllabus(text, metadata) {
  // TODO Phase 3: refine regex after inspecting real RGPV syllabus PDFs
  const parts = text.split(/\bUNIT[-\s]*[0-9IVX]+\b/i);
  return makeChunks(parts, metadata);
}

/**
 * PYQ Papers: split by question number.
 * Each question is independent — enables precise retrieval.
 * Example boundaries: "Q1.", "1)", "1."
 */
function chunkPYQ(text, metadata) {
  // TODO Phase 3: refine regex after inspecting real RGPV PYQ PDFs
  const parts = text.split(/(?:^|\n)\s*(?:Q\.?\s*)?[0-9]+[.)]/m);
  return makeChunks(parts, metadata);
}

/**
 * Exam Rules / Ordinance: split by clause or paragraph.
 * Each rule is independent — prevents mixing regulations.
 */
function chunkRules(text, metadata) {
  // Split on double newlines (paragraph boundaries) or numbered clauses
  const parts = text.split(/\n\s*\n|\b(?:Clause|Article|Section)\s+[0-9]+/i);
  return makeChunks(parts, metadata);
}

/**
 * Academic Calendar: split by event/date block.
 * Each date entry is standalone.
 */
function chunkCalendar(text, metadata) {
  // Split on lines that start with a date pattern
  const parts = text.split(/\n(?=\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
  return makeChunks(parts, metadata);
}

/**
 * Fee Structure: split by fee category.
 */
function chunkFees(text, metadata) {
  const parts = text.split(/\n\s*\n/);
  return makeChunks(parts, metadata);
}

module.exports = { chunkDocument };

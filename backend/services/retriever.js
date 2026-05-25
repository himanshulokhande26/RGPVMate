// services/retriever.js
// Handles: embedding via Python service + Qdrant Cloud operations
// Full implementation: Phase 3 (ingestion) + Phase 4 (query)
'use strict';

const axios = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');

const COLLECTION_NAME = 'rgpvmate_docs';

// Initialize Qdrant Client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  port: process.env.QDRANT_URL.startsWith('https') ? 443 : undefined,
});

/**
 * Convert a 32-character hex string (like MD5) to a valid UUID format (8-4-4-4-12)
 */
function toUuid(md5Hex) {
  return `${md5Hex.slice(0, 8)}-${md5Hex.slice(8, 12)}-${md5Hex.slice(12, 16)}-${md5Hex.slice(16, 20)}-${md5Hex.slice(20, 32)}`;
}

/**
 * Get or create the Qdrant collection (called once at startup or on first use).
 */
async function getCollection() {
  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
      console.log(`Creating Qdrant collection: ${COLLECTION_NAME}...`);
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 384,
          distance: 'Cosine',
        }
      });
    }
  } catch (err) {
    console.error('Failed to get/create Qdrant collection:', err.message);
    throw err;
  }
}

// ── Embedding ─────────────────────────────────────────────────

/**
 * Converts text to a 384-dim vector via the Python embedder service.
 * @param {string} text
 * @returns {number[]} 384-dimensional float array
 */
async function getEmbedding(text) {
  const response = await axios.post(`${process.env.EMBEDDER_URL}/embed`, { text });
  return response.data.vector;
}

// ── Qdrant Operations ───────────────────────────────────────

/**
 * Adds an array of chunks to Qdrant Cloud.
 * @param {{ id: string, text: string, vector: number[], metadata: object }[]} chunks
 */
async function addChunks(chunks) {
  await getCollection();
  
  const points = chunks.map(c => ({
    id: toUuid(c.id),
    vector: c.vector,
    payload: {
      text: c.text,
      ...c.metadata,
    }
  }));

  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points,
  });
  console.log(`✅ Added ${chunks.length} chunks to Qdrant Cloud`);
}

/**
 * Normalises common branch abbreviations and variations to the official RGPV names stored in Qdrant.
 */
function normalizeBranch(branchInput) {
  if (!branchInput) return null;
  const clean = branchInput.toLowerCase().trim().replace(/\s+/g, ' ');

  // Direct Abbreviations / Short Synonyms
  if (clean === 'cse' || clean === 'cs' || clean === 'computer science' || clean.includes('computer science and engineering') || clean.includes('computer science engineering')) {
    return 'Computer Science Engineering';
  }
  if (clean === 'it' || clean.includes('information technology') || clean.includes('information tech')) {
    return 'Information Technology';
  }
  if (clean === 'ec' || clean.includes('electronics & communication') || clean.includes('electronics and communication') || clean.includes('electronics and communication engineering')) {
    return 'Electronics and Communication Engineering';
  }
  if (clean === 'ee' || clean.includes('electrical engineering')) {
    return 'Electrical Engineering';
  }
  if (clean === 'eee' || clean.includes('electrical and electronics')) {
    return 'Electrical and Electronics Engineering';
  }
  if (clean === 'me' || clean.includes('mechanical engineering')) {
    return 'Mechanical Engineering';
  }
  if (clean === 'ce' || clean.includes('civil engineering')) {
    return 'Civil Engineering';
  }
  if (clean === 'vlsi' || clean.includes('vlsi design')) {
    return 'Electronics Engineering VLSI Design and Technology';
  }
  if (clean === 'aiml' || clean.includes('machine learning')) {
    return 'AI and Machine Learning';
  }
  if (clean === 'aids' || clean.includes('data science')) {
    return 'AI and Data Science';
  }
  if (clean === 'common') {
    return 'Common to All Branches';
  }

  // Capitalize first letters of each word as a fallback to match DB casing
  return branchInput
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Searches Qdrant Cloud for the top-K most semantically similar chunks.
 * @param {number[]} queryVector — embedded query
 * @param {object} filters — optional metadata filters e.g. { semester: 5 }
 * @param {number} topK — number of results to return (default 4)
 * @returns {{ text: string, metadata: object, distance: number }[]}
 */
async function searchChunks(queryVector, filters = {}, topK = 4) {
  await getCollection();

  const filter = {
    must: []
  };

  // ── Pre-process filters ─────────────────────────────────────
  let targetBranch = filters.branch;
  let targetSystemType = filters.systemType;
  const sem = filters.semester ? Number(filters.semester) : undefined;

  // 1. 1st-Year Common Branch Override
  // First-year students (sem 1 & 2) share the same core syllabus, which RGPV publishes under "COMMON"
  if (sem === 1 || sem === 2) {
    targetBranch = 'Common to All Branches';
  }

  // 2. Lateral Entry Bypass
  // Lateral entry students enter in Sem 3. For Semesters 4-8, they sit in the same classrooms
  // and study the exact same B.Tech syllabus. RGPV doesn't publish separate "Lateral" PDFs for Sem 4-8.
  if (targetSystemType === 'LATERALENTRY' && sem >= 4) {
    targetSystemType = undefined; // Bypass filter so it queries standard B.Tech/B.E. schemes
  }

  // ── Build Qdrant filters ────────────────────────────────────
  if (sem) {
    filter.must.push({
      key: 'semester',
      match: { value: sem }
    });
  }
  if (targetBranch) {
    const normalizedBranch = normalizeBranch(targetBranch);
    filter.must.push({
      key: 'branch',
      match: { value: normalizedBranch }
    });
  }
  if (targetSystemType) {
    filter.must.push({
      key: 'systemType',
      match: { value: targetSystemType }
    });
  }
  if (filters.type) {
    filter.must.push({
      key: 'type',
      match: { value: filters.type }
    });
  }

  const searchParams = {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  };

  if (filter.must.length > 0) {
    searchParams.filter = filter;
  }

  const results = await qdrant.search(COLLECTION_NAME, searchParams);

  // Flatten results into standard shapes
  return results.map(r => ({
    text: r.payload.text,
    metadata: { ...r.payload },
    distance: 1 - r.score, // Distance (lower is closer) = 1 - similarity score
  }));
}

/**
 * Deletes all chunks whose metadata.source matches the given filename.
 * Used by the admin panel's Replace and Delete operations.
 * @param {string} sourceName — e.g. 'RGPV_Ordinance_2023.pdf'
 */
async function deleteChunksBySource(sourceName) {
  await getCollection();
  await qdrant.delete(COLLECTION_NAME, {
    filter: {
      must: [
        {
          key: 'source',
          match: { value: sourceName }
        }
      ]
    }
  });
  console.log(`🗑️  Deleted all chunks for source: ${sourceName}`);
}

/**
 * Returns a list of unique source documents and their chunk counts.
 * Used by the admin panel's document list.
 */
async function listDocuments() {
  await getCollection();
  
  // Fetch up to 10,000 points scroll with only the 'source' key to keep payload size tiny
  const scrollResults = await qdrant.scroll(COLLECTION_NAME, {
    limit: 10000,
    with_payload: ['source'],
  });

  const counts = {};
  for (const point of scrollResults.points) {
    if (point.payload && point.payload.source) {
      const src = point.payload.source;
      counts[src] = (counts[src] || 0) + 1;
    }
  }

  return Object.entries(counts).map(([source, chunks]) => ({ source, chunks }));
}

module.exports = { getEmbedding, addChunks, searchChunks, deleteChunksBySource, listDocuments };

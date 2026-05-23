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

  if (filters.semester) {
    filter.must.push({
      key: 'semester',
      match: { value: filters.semester }
    });
  }
  if (filters.branch) {
    filter.must.push({
      key: 'branch',
      match: { value: filters.branch }
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

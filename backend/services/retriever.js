// services/retriever.js
// Handles: embedding via Python service + ChromaDB operations
// Full implementation: Phase 3 (ingestion) + Phase 4 (query)
'use strict';

const axios = require('axios');
const { ChromaClient } = require('chromadb');

const COLLECTION_NAME = 'rgpvmate_docs';
let collection = null;

// ── ChromaDB Client ───────────────────────────────────────────
const chroma = new ChromaClient({
  path: process.env.CHROMA_URL || 'http://localhost:8000',
});

/**
 * Get or create the ChromaDB collection (called once at startup or on first use).
 */
async function getCollection() {
  if (collection) return collection;
  collection = await chroma.getOrCreateCollection({ name: COLLECTION_NAME });
  return collection;
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

// ── ChromaDB Operations ───────────────────────────────────────

/**
 * Adds an array of chunks to ChromaDB.
 * @param {{ id: string, text: string, vector: number[], metadata: object }[]} chunks
 */
async function addChunks(chunks) {
  const col = await getCollection();
  await col.add({
    ids:        chunks.map(c => c.id),
    documents:  chunks.map(c => c.text),
    embeddings: chunks.map(c => c.vector),
    metadatas:  chunks.map(c => c.metadata),
  });
  console.log(`✅ Added ${chunks.length} chunks to ChromaDB`);
}

/**
 * Searches ChromaDB for the top-K most semantically similar chunks.
 * @param {number[]} queryVector — embedded query
 * @param {object} filters — optional metadata filters e.g. { semester: 5 }
 * @param {number} topK — number of results to return (default 4)
 * @returns {{ text: string, metadata: object, distance: number }[]}
 */
async function searchChunks(queryVector, filters = {}, topK = 4) {
  const col = await getCollection();

  // Build ChromaDB where clause from filters (only include non-null values)
  const where = {};
  if (filters.semester) where.semester = { $eq: filters.semester };
  if (filters.branch)   where.branch   = { $eq: filters.branch };
  if (filters.type)     where.type     = { $eq: filters.type };

  const results = await col.query({
    queryEmbeddings: [queryVector],
    nResults: topK,
    where: Object.keys(where).length > 0 ? where : undefined,
  });

  // Flatten results into usable objects
  return results.documents[0].map((text, i) => ({
    text,
    metadata: results.metadatas[0][i],
    distance: results.distances[0][i],
  }));
}

/**
 * Deletes all chunks whose metadata.source matches the given filename.
 * Used by the admin panel's Replace and Delete operations.
 * @param {string} sourceName — e.g. 'RGPV_Ordinance_2023.pdf'
 */
async function deleteChunksBySource(sourceName) {
  const col = await getCollection();
  await col.delete({ where: { source: { $eq: sourceName } } });
  console.log(`🗑️  Deleted all chunks for source: ${sourceName}`);
}

/**
 * Returns a list of unique source documents and their chunk counts.
 * Used by the admin panel's document list.
 */
async function listDocuments() {
  const col = await getCollection();
  const all = await col.get({ include: ['metadatas'] });

  const counts = {};
  for (const meta of all.metadatas) {
    const src = meta.source || 'unknown';
    counts[src] = (counts[src] || 0) + 1;
  }

  return Object.entries(counts).map(([source, chunks]) => ({ source, chunks }));
}

module.exports = { getEmbedding, addChunks, searchChunks, deleteChunksBySource, listDocuments };

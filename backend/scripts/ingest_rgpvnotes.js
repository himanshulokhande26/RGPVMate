require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { addChunks, deleteChunksBySource } = require('../services/retriever');

async function fetchBatchEmbeddings(texts) {
  const BATCH_SIZE = 32;
  const vectors = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await axios.post(`${process.env.EMBEDDER_URL}/embed`, { text: batch });
      vectors.push(...response.data.vectors);
    } catch (err) {
      console.warn(`Fallback for batch ${i}`);
      for (const text of batch) {
        const response = await axios.post(`${process.env.EMBEDDER_URL}/embed`, { text });
        vectors.push(response.data.vector);
      }
    }
  }
  return vectors;
}

function chunkId(source, index) {
  return crypto.createHash('md5').update(`${source}-${index}`).digest('hex');
}

async function ingestRgpvNotes() {
  console.log('Ingesting B.Tech pure-text syllabuses from rgpvnotes.in...');
  
  const syllabusDir = path.join(__dirname, '../documents/syllabus/rgpvnotes');
  if (!fs.existsSync(syllabusDir)) {
    console.log('❌ No rgpvnotes syllabus directory found.');
    return;
  }

  const files = fs.readdirSync(syllabusDir).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} rgpvnotes syllabus files.`);

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(syllabusDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    
    // Filename: CS-601.md -> subject code CS-601
    const subjectMatch = file.match(/^([A-Z]{2,3}-\d{3,4})/);
    const subjectCode = subjectMatch ? subjectMatch[1] : file.replace('.md', '');

    // Do not split by \n\n. The LLM needs the entire syllabus in one chunk to avoid missing units
    // in top_k retrieval (RAG fragmentation).
    const chunks = [];
    
    // We only need one chunk for the entire file, as syllabi are small enough for modern embedders/LLMs
    const chunkText = `Subject: ${subjectCode}\nSource: RGPVNotes Syllabus\n\n${text.trim()}`;
    chunks.push({
      id: chunkId(file, 0),
      text: chunkText,
      metadata: {
        source: `rgpvnotes_${file}`,
        type: 'syllabus',
        program: 'B.Tech',
        subject: subjectCode,
        isRgpvNotes: true
      }
    });

    if (chunks.length === 0) continue;

    const texts = chunks.map(c => c.text);
    const vectors = await fetchBatchEmbeddings(texts);

    const chunksWithVectors = chunks.map((chunk, i) => ({
      ...chunk,
      vector: vectors[i]
    }));

    try {
      const sourceName = `rgpvnotes_${file}`;
      await deleteChunksBySource(sourceName);
      await addChunks(chunksWithVectors);
      console.log(`✅ Ingested ${chunks.length} chunks for ${file}`);
      totalChunks += chunks.length;
    } catch (err) {
      console.error(`❌ Failed to ingest ${file}:`, err.message);
    }
  }

  console.log(`\n🎉 Total pure-text B.Tech syllabus chunks ingested: ${totalChunks}`);
}

ingestRgpvNotes().catch(err => {
  console.error('Fatal error:', err);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { addChunks, deleteChunksBySource } = require('../services/retriever');
const crypto = require('crypto');
const axios = require('axios');

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

async function run() {
  console.log('Ingesting BTECH_SYLLABUS_ALL.md with MD-specific chunker...');
  const filePath = path.join(__dirname, '../../documents/scheme/BTECH_SYLLABUS_ALL.md');
  const rawText = fs.readFileSync(filePath, 'utf8');

  const lines = rawText.split('\n');
  const chunks = [];
  
  let currentProgram = 'B.Tech';
  let currentBranch = '';
  let currentSemester = '';
  let currentSystem = '';
  
  let currentTextBlock = [];
  
  const pushChunk = () => {
    if (currentTextBlock.length > 0 && currentBranch && currentSemester) {
      const text = `List of Subjects for ${currentProgram}, Branch: ${currentBranch}, Semester: ${currentSemester}, System: ${currentSystem}:\n` + currentTextBlock.join('\n');
      chunks.push({
        id: chunkId('BTECH_SYLLABUS_ALL.md', chunks.length),
        text: text,
        metadata: {
          source: 'BTECH_SYLLABUS_ALL.md',
          type: 'scheme',
          program: currentProgram,
          branch: currentBranch,
          semester: Number(currentSemester),
          systemType: currentSystem,
          chunkType: 'subject_list_md'
        }
      });
      currentTextBlock = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('## Program:')) {
      pushChunk(); // Push previous block
      // Extract program and branch
      const match = t.match(/## Program:\s*(.*?)\s*\|\s*Branch:\s*(.*)/);
      if (match) {
        currentProgram = match[1].trim();
        currentBranch = match[2].trim();
      }
    } else if (t.startsWith('### System:')) {
      pushChunk(); // Push previous block
      // Extract system and semester
      const match = t.match(/### System:\s*(.*?)\s*\|\s*Semester:\s*(\d+)/);
      if (match) {
        currentSystem = match[1].trim();
        currentSemester = match[2].trim();
      }
    } else if (t.startsWith('- ') || t.startsWith('**')) {
      currentTextBlock.push(t);
    }
  }
  pushChunk(); // Push last block

  console.log(`Generated ${chunks.length} clean MD chunks.`);

  const texts = chunks.map(c => c.text);
  const vectors = await fetchBatchEmbeddings(texts);

  const chunksWithVectors = chunks.map((chunk, i) => ({
    ...chunk,
    vector: vectors[i],
  }));

  await deleteChunksBySource('BTECH_SYLLABUS_ALL.md');
  await addChunks(chunksWithVectors);
  console.log(`✅ Successfully ingested ${chunks.length} chunks to Qdrant.`);
}

run().catch(console.error);

require('dotenv').config();
const { getEmbedding, searchChunks } = require('../services/retriever');

async function testRetrieval() {
  const query = "list the subjects in 5th sem cse";
  console.log(`Querying: "${query}"`);
  
  // 1. Embed query
  const vector = await getEmbedding(query);
  
  // 2. Search Qdrant
  const context = await searchChunks(vector, {
    program: 'B.Tech',
    branch: 'Computer Science Engineering',
    semester: 5
  });
  
  console.log(`\nRetrieved ${context.length} chunks:\n`);
  context.forEach(c => {
    console.log(`--- Distance: ${c.distance} ---`);
    console.log(c.text);
  });
}

testRetrieval().catch(console.error);

// scripts/ping_embedder.js
const axios = require('axios');

axios.get('http://localhost:5000/health')
  .then(res => {
    console.log('✅ Embedder is ALIVE!');
    console.log(res.data);
  })
  .catch(err => {
    console.error('❌ Embedder is DEAD or unreachable!');
    console.error(`Message: ${err.message}`);
    if (err.code) console.error(`Code: ${err.code}`);
  });

// scripts/ping_qdrant.js
const axios = require('axios');

const url = 'https://70b468f5-e3d9-4ff2-853a-f0e18942996c.us-east-1-1.aws.cloud.qdrant.io/collections';
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6NjliOTI5ZWQtOWZjZi00ODAyLTkzOTAtNDUxMGMzOGY5Njg5In0.n4HqV8U1xgJYnWwEMFmsA-I7u89oPF20Nc8tUxeouZM';

console.log('Pinging Qdrant Cloud over port 443...');

axios.get(url, {
  headers: {
    'api-key': apiKey
  }
})
  .then(res => {
    console.log('✅ Qdrant Cloud is ALIVE and reachable over port 443!');
    console.log(JSON.stringify(res.data, null, 2));
  })
  .catch(err => {
    console.error('❌ Qdrant Cloud is DEAD or unreachable!');
    console.error(`Message: ${err.message}`);
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(err.response.data);
    }
  });

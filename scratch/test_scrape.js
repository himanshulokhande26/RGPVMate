const https = require('https');
const fs = require('fs');

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function scrape() {
  const html = await fetchHTML('https://www.rgpvnotes.in/btech/grading-system-old/qp/p/computer-science-2nd-year.html');
  // the format is often something like:
  // >CS-302 - Discrete Structure<
  // Or
  // >CS-302 : Discrete Structure<
  
  const text = html.replace(/<[^>]+>/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const subjects = [];
  // simple matching
  for (const line of lines) {
    if (line.match(/^[A-Z]{2,3}\s*-\s*\d{3,4}/)) {
      subjects.push(line);
    }
  }
  
  console.log('Subjects found:');
  console.log(subjects);
}

scrape();

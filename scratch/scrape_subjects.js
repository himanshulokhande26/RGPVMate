const fs = require('fs');
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const years = ['1st-year', 'computer-science-2nd-year', 'computer-science-3rd-year', 'computer-science-4th-year', 'information-technology-2nd-year', 'information-technology-3rd-year', 'information-technology-4th-year'];
  const baseUrl = 'https://www.rgpvnotes.in/btech/grading-system-old/qp/p/';
  
  for (const year of years) {
    console.log(`Fetching ${year}...`);
    try {
      const html = await fetchUrl(baseUrl + year + '.html');
      // basic parsing, look for strings like "CS-302 - Discrete Structure"
      // they are usually inside <a> tags or <h3>
      const regex = />([A-Z]{2,3}-\d{3}\s*-\s*[^<]+)</g;
      let match;
      const subjects = new Set();
      while ((match = regex.exec(html)) !== null) {
        subjects.add(match[1].trim());
      }
      console.log(`\n--- ${year} ---`);
      Array.from(subjects).forEach(s => console.log(s));
    } catch (e) {
      console.error('Failed to fetch', year, e.message);
    }
  }
}

run();

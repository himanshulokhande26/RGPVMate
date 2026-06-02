const axios = require('axios');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

const BRANCHES = [
  { id: 'computer-science', name: 'Computer Science Engineering' },
  { id: 'information-technology', name: 'Information Technology' },
  { id: 'electronics-and-communication', name: 'Electronics and Communication Engineering' },
  { id: 'mechanical-engineering', name: 'Mechanical Engineering' },
  { id: 'civil-engineering', name: 'Civil Engineering' }
];

const YEARS = [
  { id: '2nd-year', semesters: [3, 4] },
  { id: '3rd-year', semesters: [5, 6] },
  { id: '4th-year', semesters: [7, 8] }
];

const OUTPUT_DIR = path.resolve(__dirname, '../documents/syllabus/rgpvnotes');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Sleep utility to prevent rate-limiting
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSubjectSyllabus(url, subjectCode, subjectName) {
  const filename = `${subjectCode.replace(/[^A-Za-z0-9-]/g, '')}.md`;
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    console.log(`      ⏭️ Skipping ${subjectCode}, already exists.`);
    return true;
  }

  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await axios.get(url, { timeout: 30000 });
      const dom = new JSDOM(response.data);
      const document = dom.window.document;
    
    const postBody = document.querySelector('.post-body');
    if (!postBody) {
      console.log(`      ⚠️  No post-body found for ${subjectCode}`);
      return false;
    }

    const html = postBody.innerHTML
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n');
      
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    let textBody = temp.textContent || temp.innerText || '';
    textBody = textBody.replace(/[\r\n]{2,}/g, '\n\n').trim();

    if (textBody.length > 50 && textBody.toUpperCase().includes('UNIT')) {
      fs.writeFileSync(filePath, `# Syllabus: ${subjectCode} - ${subjectName}\n\n${textBody}`, 'utf-8');
      console.log(`      ✅ Saved syllabus for ${subjectCode}`);
      return true;
    } else {
      console.log(`      ⚠️  No syllabus text found for ${subjectCode}`);
      return false;
    }
  } catch (error) {
    attempt++;
    console.log(`      ⚠️ Attempt ${attempt} failed for ${subjectCode}: ${error.message}`);
    await sleep(2000);
  }
  }
  console.log(`      ❌ Failed fetching ${subjectCode} after 3 attempts.`);
  return false;
}

async function scrape() {
  console.log('Starting syllabus scrape from https://www.rgpvnotes.in/btech/grading-system-old/qp/ ...\n');

  for (const branch of BRANCHES) {
    console.log(`\n================================`);
    console.log(`🎓 Fetching ${branch.name}`);
    console.log(`================================`);
    
    for (const year of YEARS) {
      let urlId = `${branch.id}-${year.id}`;
      if (branch.id === 'electronics-and-communication') {
         if (year.id === '2nd-year') urlId = 'electronics-and-communication_4';
         if (year.id === '3rd-year') urlId = 'electronics-and-communication_1';
         if (year.id === '4th-year') urlId = 'electronics-and-communication';
      }

      const yearUrl = `https://www.rgpvnotes.in/btech/grading-system-old/qp/p/${urlId}.html`;
      console.log(`\n  📅 Year: ${year.id} -> ${yearUrl}`);
      
      let yearAttempt = 0;
      let success = false;
      while (yearAttempt < 3 && !success) {
        try {
          const response = await axios.get(yearUrl, { timeout: 30000 });
          const dom = new JSDOM(response.data);
          const document = dom.window.document;
        
        const links = document.querySelectorAll('a');
        const subjectLinks = new Map(); // using Map to deduplicate by code

        // Find links that look like subjects (e.g. CS-601)
        for (const link of links) {
          const text = link.textContent || '';
          const href = link.getAttribute('href');
          
          if (href && href.includes('.html')) {
            const match = text.match(/\b([A-Z]{2,3}-\d{3,4}(?:\s*\(?[a-zA-Z]?\)?)?)\s*[-:]\s*(.+)/);
            if (match) {
              const code = match[1].trim();
              const name = match[2].trim().replace(/\s+/g, ' ');
              
              if (!subjectLinks.has(code)) {
                // Ensure URL is absolute by resolving against yearUrl
                const absoluteUrl = new URL(href, yearUrl).href;
                subjectLinks.set(code, { url: absoluteUrl, name });
              }
            }
          }
        }

        console.log(`    Found ${subjectLinks.size} subjects.`);
        
        for (const [code, data] of subjectLinks.entries()) {
          console.log(`    -> Fetching ${code} - ${data.name}`);
          await fetchSubjectSyllabus(data.url, code, data.name);
          await sleep(500); // Polite delay
        }
        success = true;

      } catch (error) {
        yearAttempt++;
        console.error(`  ⚠️ Error fetching year page ${yearUrl}: ${error.message}`);
        await sleep(2000);
      }
      }
      if (!success) console.error(`  ❌ Failed year page ${yearUrl} after 3 attempts.`);
    }
  }

  console.log('\n✅ Scrape complete! Files saved to backend/documents/syllabus/rgpvnotes/');
}

scrape();

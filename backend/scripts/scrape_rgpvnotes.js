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

function extractSubjects(element) {
  const text = element.textContent || '';
  // match things like CS-301 - Data Structure
  const match = text.match(/\b([A-Z]{2,3}-\d{3,4}(?:\s*\(?[a-zA-Z]?\)?)?)\s*[-:]\s*(.+)/);
  if (match) {
    const code = match[1].trim();
    const name = match[2].trim().replace(/\s+/g, ' ');
    if (name.length > 3 && !name.toLowerCase().includes('click here') && !name.toLowerCase().includes('download')) {
      return `${code} - ${name}`;
    }
  }
  return null;
}

async function scrape() {
  console.log('Starting scrape of rgpvnotes.in...');
  let mdContent = `# B.Tech Comprehensive Syllabus Mapping\n\n`;
  mdContent += `This document contains the complete list of subjects for B.Tech Grading System, accurately scraped to ensure correct retrieval for students.\n\n`;

  for (const branch of BRANCHES) {
    console.log(`\nFetching ${branch.name}...`);
    mdContent += `## Program: B.Tech | Branch: ${branch.name}\n\n`;
    
    for (const year of YEARS) {
      let urlId = `${branch.id}-${year.id}`;
      if (branch.id === 'electronics-and-communication') {
         if (year.id === '2nd-year') urlId = 'electronics-and-communication_4';
         if (year.id === '3rd-year') urlId = 'electronics-and-communication_1';
         if (year.id === '4th-year') urlId = 'electronics-and-communication';
      }

      const url = `https://www.rgpvnotes.in/btech/grading-system-old/qp/p/${urlId}.html`;
      console.log(` -> ${url}`);
      try {
        const response = await axios.get(url);
        const html = response.data;
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        let currentSem = null;
        const subjectsSem1 = new Set();
        const subjectsSem2 = new Set();
        
        // Let's iterate over elements
        const elements = document.querySelectorAll('h2, h3, h4, h5, h6, a, p, span, div');
        for (const el of elements) {
          const text = el.textContent || '';
          
          // Detect semester header
          const sem1Regex = new RegExp(`${year.semesters[0]}(?:rd|th)\\s+semester`, 'i');
          const sem2Regex = new RegExp(`${year.semesters[1]}(?:rd|th)\\s+semester`, 'i');
          
          if (sem1Regex.test(text)) {
            currentSem = year.semesters[0];
          } else if (sem2Regex.test(text)) {
            currentSem = year.semesters[1];
          }
          
          // Try to extract subject
          const subject = extractSubjects(el);
          if (subject) {
            if (currentSem === year.semesters[0]) {
              subjectsSem1.add(subject);
            } else if (currentSem === year.semesters[1]) {
              subjectsSem2.add(subject);
            } else {
              // fallback if semester wasn't detected yet
              subjectsSem1.add(subject);
            }
          }
        }
        
        const formatSubjects = (sem, subjSet) => {
          if (subjSet.size > 0) {
            mdContent += `### System: Grading System | Semester: ${sem}\n`;
            const groups = {};
            Array.from(subjSet).forEach(s => {
              const codeMatch = s.match(/^([A-Z]{2,3}-\d{3,4})/);
              const baseCode = codeMatch ? codeMatch[1] : s;
              if (!groups[baseCode]) groups[baseCode] = [];
              groups[baseCode].push(s);
            });
            
            let electiveCount = 0;
            for (const baseCode in groups) {
              const group = groups[baseCode];
              if (group.length > 1) {
                electiveCount++;
                const electiveType = electiveCount === 1 ? "Departmental Elective" : "Open Elective";
                mdContent += `**${electiveType} (Choose One):**\n`;
                group.forEach(s => mdContent += `- ${s}\n`);
              } else {
                mdContent += `- ${group[0]}\n`;
              }
            }
            mdContent += `\n`;
          }
        };

        formatSubjects(year.semesters[0], subjectsSem1);
        formatSubjects(year.semesters[1], subjectsSem2);
        
        console.log(`    Found ${subjectsSem1.size + subjectsSem2.size} subjects.`);
      } catch (e) {
        console.error(`    Error fetching: ${e.message}`);
      }
    }
  }

  const outPath = path.join(__dirname, '../../documents/scheme/BTECH_SYLLABUS_ALL.md');
  fs.writeFileSync(outPath, mdContent);
  console.log(`\nSuccessfully wrote to ${outPath}`);
}

scrape();

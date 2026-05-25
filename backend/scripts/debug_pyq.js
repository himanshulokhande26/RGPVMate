// scripts/debug_pyq.js
const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api/chat';

async function run() {
  const q = 'list top 10 PYQ of database management system';
  console.log(`Querying: "${q}"...`);
  try {
    const res = await axios.post(BASE_URL, {
      question: q,
      semester: 5,
      branch: 'Information Technology'
    });
    console.log('\n--- ANSWER ---');
    console.log(res.data.answer);
    console.log('\n--- SOURCES ---');
    console.log(res.data.sources);
    
    const answer = res.data.answer;
    const answerLower = answer.toLowerCase();
    
    const isRGPVQuery = /\b(syllabus|scheme|schemes|subjects?|sems?|semesters?|credits?|ordinance|passing|cgpa|exams?|rgpv|btech|enroll|fees?|results?|backlogs?|grading|pyqs?|previous\s+year|old\s+paper|question\s+paper|notices?|notifications?|updates?|announcements?|circulars?)\b/i.test(q);
    
    const hasRGPVContent =
      answerLower.includes('syllabus') || answerLower.includes('scheme') ||
      answerLower.includes('unit \u2013') || answerLower.includes('unit -') ||
      answerLower.includes('ordinance') || answerLower.includes('passing') ||
      answerLower.includes('credit') || answerLower.includes('subject code') ||
      answerLower.includes('want the unit-wise') || answerLower.includes('want a detailed') ||
      answerLower.includes('pyq') || answerLower.includes('previous year') ||
      answerLower.includes('exam') || answerLower.includes('notice') ||
      answerLower.includes('announcement') || answerLower.includes('circular') ||
      answerLower.includes('published') || answerLower.includes('notification') ||
      answerLower.includes('update') || answerLower.includes('result') ||
      answerLower.includes('enrollment') || answerLower.includes('registration') ||
      answerLower.includes('timetable') || answerLower.includes('time table') ||
      answerLower.includes('schedule');

    const isDenial =
      /i don't have/i.test(answer) ||
      /i do not have/i.test(answer) ||
      /not found/i.test(answer) ||
      /no notice/i.test(answer) ||
      /cannot find/i.test(answer) ||
      /could not find/i.test(answer) ||
      /unable to find/i.test(answer) ||
      /no details/i.test(answer) ||
      /no information/i.test(answer) ||
      /nahi rakh sakta/i.test(answer) ||
      /nahi de sakta/i.test(answer) ||
      /nahi bata sakta/i.test(answer) ||
      /nahi mila/i.test(answer) ||
      /details nahi/i.test(answer) ||
      /info nahi/i.test(answer) ||
      /pata nahi/i.test(answer) ||
      /mere paas.*nahi/i.test(answer) ||
      /maaf karna/i.test(answer) ||
      /out of my zone/i.test(answer);

    const isPyq = /\b(pyq|pyqs|previous\s+year|old\s+paper|question\s+paper|exam\s+paper)\b/i.test(q);
      
    console.log('\n--- DIAGNOSTICS ---');
    console.log(`isRGPVQuery: ${isRGPVQuery}`);
    console.log(`hasRGPVContent: ${hasRGPVContent}`);
    console.log(`isPyq: ${isPyq}`);
    console.log(`isDenial: ${isDenial}`);
    console.log(`suppressSources: ${!isRGPVQuery || (!hasRGPVContent && !isPyq) || isDenial}`);
  } catch (err) {
    console.error(err);
  }
}

run();

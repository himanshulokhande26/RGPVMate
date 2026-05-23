// scripts/detect_invalid_pdfs.js
const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '../../documents');
const subfolders = ['syllabus', 'scheme'];

console.log('Scanning documents for invalid (HTML disguised as PDF) files...\n');

let htmlFiles = [];
let validCount = 0;

for (const folder of subfolders) {
  const folderPath = path.join(DOCS_DIR, folder);
  if (!fs.existsSync(folderPath)) {
    console.log(`Directory not found: ${folderPath}`);
    continue;
  }

  const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`📂 Scanning ${folder}/ (${files.length} files)...`);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    try {
      const buffer = fs.readFileSync(filePath);
      // A valid PDF must start with %PDF
      const header = buffer.toString('utf8', 0, 10);
      if (!header.startsWith('%PDF')) {
        console.log(`   ❌ Invalid PDF: ${folder}/${file}`);
        htmlFiles.push({ folder, file, path: filePath, header: buffer.toString('utf8', 0, 100) });
      } else {
        validCount++;
      }
    } catch (err) {
      console.log(`   💥 Error reading ${folder}/${file}: ${err.message}`);
    }
  }
}

console.log('\n══════════════════════════════════════════════');
console.log(`Scan Complete:`);
console.log(`  Valid PDFs : ${validCount}`);
console.log(`  Invalid HTML Files : ${htmlFiles.length}`);
console.log('══════════════════════════════════════════════\n');

if (htmlFiles.length > 0) {
  console.log('Detail of invalid files:');
  htmlFiles.forEach((info, i) => {
    console.log(`[${i + 1}] ${info.folder}/${info.file}`);
    console.log(`    Header preview: "${info.header.replace(/\r?\n/g, ' ').trim()}"`);
  });
}

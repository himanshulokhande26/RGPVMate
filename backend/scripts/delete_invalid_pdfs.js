// scripts/delete_invalid_pdfs.js
const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '../../documents');
const subfolders = ['syllabus', 'scheme'];

console.log('Cleaning up invalid HTML disguised as PDF files...\n');

let deletedCount = 0;

for (const folder of subfolders) {
  const folderPath = path.join(DOCS_DIR, folder);
  if (!fs.existsSync(folderPath)) continue;

  const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    try {
      const buffer = fs.readFileSync(filePath);
      const header = buffer.toString('utf8', 0, 10);
      if (!header.startsWith('%PDF')) {
        console.log(`   🗑️  Deleting invalid file: ${folder}/${file}`);
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    } catch (err) {
      console.log(`   💥 Error processing ${folder}/${file}: ${err.message}`);
    }
  }
}

console.log('\n══════════════════════════════════════════════');
console.log(`Cleanup Complete:`);
console.log(`  Invalid files deleted: ${deletedCount}`);
console.log('══════════════════════════════════════════════\n');

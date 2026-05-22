// scripts/ingest.js
// Run with: npm run ingest
// Loads all PDFs from the /documents folder into ChromaDB.
// Safe to re-run — skips files already ingested (checks by source name).
'use strict';

require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const pdf   = require('pdf-parse');
const { chunkDocument }       = require('../services/chunker');
const { getEmbedding, addChunks, listDocuments } = require('../services/retriever');

// ── Config ────────────────────────────────────────────────────
const DOCS_ROOT = path.join(__dirname, '../../documents');

// Map folder names → document types used by chunker.js
const FOLDER_TYPE_MAP = {
  syllabus: 'syllabus',
  pyq:      'pyq',
  rules:    'rules',
  calendar: 'calendar',
  fees:     'fees',
};

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parses metadata out of the standardised filename.
 *
 * Convention: RGPV_<DOCTYPE>_<PROGRAM>_<SYSTEMTYPE>_<BRANCH>_SEM<N>[_<YEAR>].pdf
 *             YEAR is optional — omit it for syllabi that have never been revised.
 *
 * Programs  : BTECH | BTECHPTDC | MTECH | MTECHPT | ME | MCA | MCA2 | MCADUAL |
 *              MBA | MBAINT | BPHARM | BPHARMPCI | MPHARM | MPHARMPCI | PHARMD |
 *              BARCH | MARCH | BDESIGN | BE | BEPTDC | MPLAN | DIPLOMA |
 *              PHD | PHDENT | PGCMB | DDIPG
 * SystemType: CBCS | CBGS | GRADING | NONGRADING | LATERALENTRY | COA
 * Branch    : CSE | IT | EC | EE | ME | CE | EI | CSBS | CH | BT | AG | AGE |
 *              AUTO | MIN | MINMP | BM | IP | CSIT | CSSEC | IOT | AIML | AIDS |
 *              DS | CSEAI | CSD | CSBCHAIN | 3DANIM | AR | RM | RAI | EV | AME |
 *              ECS | MECH | ECACT | VLSI | FIRE | EEE | COMMON
 *
 * Examples:
 *   With year (scheme-specific syllabus):
 *     RGPV_SYLLABUS_BTECH_CBCS_CSE_SEM3_2022.pdf
 *       → { program:'B.Tech', systemType:'CBCS', branch:'Computer Science Engineering',
 *           semester:3, scheme:'2022' }
 *
 *   Without year (timeless / never-revised syllabus):
 *     RGPV_SYLLABUS_BTECH_CBCS_ME_SEM3.pdf
 *       → { program:'B.Tech', systemType:'CBCS', branch:'Mechanical Engineering',
 *           semester:3 }   ← no scheme/year metadata
 *
 *   Common to all branches:
 *     RGPV_SYLLABUS_BTECH_GRADING_COMMON_SEM1_2018.pdf
 *
 *   Other document types:
 *     RGPV_PYQ_CSE_CS501_2023.pdf   → { branch:'CSE', subject:'CS501', year:'2023' }
 *     RGPV_RULES_ORDINANCE_2023.pdf → { year:'2023' }
 *     RGPV_CALENDAR_2024.pdf        → { year:'2024' }
 */
function parseFilenameMetadata(filename) {
  const name = path.basename(filename, '.pdf').toUpperCase();
  const parts = name.split('_');
  const meta = {};

  // ── Program ───────────────────────────────────────────────
  // Source: RGPV frm_viewscheme.aspx "Program" dropdown — all 26 values
  const PROGRAMS = {
    BTECH:        'B.Tech',
    BTECHPTDC:    'B.Tech.-PTDC',
    MTECH:        'M.Tech.',
    MTECHPT:      'M.Tech.(Part Time)',
    ME:           'M.E.',
    MCA:          'MCA',
    MCA2:         'MCA 2 Year',
    MCADUAL:      'MCA Dual Degree',
    MBA:          'MBA',
    MBAINT:       'MBA Integrated',
    BPHARM:       'B.Pharm',
    BPHARMPCI:    'B.Pharm.(PCI)',
    MPHARM:       'M.Pharm',
    MPHARMPCI:    'M.Pharm. PCI',
    PHARMD:       'Pharm D.',
    BARCH:        'B.Arch',
    MARCH:        'M.Arch',
    BDESIGN:      'B.Design',
    BE:           'BE',
    BEPTDC:       'BE-PTDC',
    MPLAN:        'M.Plan',
    DIPLOMA:      'Diploma',
    PHD:          'Ph.D.',
    PHDENT:       'Ph.D. Entrance',
    PGCMB:        'PGCMB',
    DDIPG:        'DDI-PG',
  };
  const programPart = parts.find(p => Object.keys(PROGRAMS).includes(p));
  if (programPart) meta.program = PROGRAMS[programPart];

  // ── System Type ───────────────────────────────────────────
  const SYSTEM_TYPES = {
    CBCS:         'CBCS',
    CBGS:         'CBGS',
    GRADING:      'Grading System',
    NONGRADING:   'Non Grading System',
    LATERALENTRY: 'Lateral Entry',
    COA:          'As per COA',
  };
  const sysTypePart = parts.find(p => Object.keys(SYSTEM_TYPES).includes(p));
  if (sysTypePart) meta.systemType = SYSTEM_TYPES[sysTypePart];

  // ── Branch / Subject Area ─────────────────────────────────
  // Token → Full official RGPV branch name
  const BRANCHES = {
    // Core / Traditional Engineering
    AG:       'Agriculture Technology',
    AGE:      'Agriculture Engineering',
    AUTO:     'Automobile Engineering',
    CE:       'Civil Engineering',
    CH:       'Chemical Engineering',
    CSE:      'Computer Science Engineering',
    EC:       'Electronics and Communication Engineering',
    EE:       'Electrical Engineering',
    EEE:      'Electrical and Electronics Engineering',
    EI:       'Electronics and Instrumentation Engineering',
    FIRE:     'Fire Technology and Safety Engineering',
    IT:       'Information Technology',
    ME:       'Mechanical Engineering',
    MIN:      'Mining Engineering',
    MINMP:    'Mining and Mineral Processing',
    BM:       'Biomedical Engineering',
    IP:       'Industrial Production',
    BT:       'Biotechnology',

    // Specialised / Emerging B.Tech branches
    CSIT:     'Computer Science and Information Technology',
    CSBS:     'Computer Science and Business Systems',
    CSSEC:    'Cyber Security',
    IOT:      'CSE IoT',
    AIML:     'AI and Machine Learning',
    AIDS:     'AI and Data Science',
    DS:       'CSE Data Science',
    CSEAI:    'CSE Artificial Intelligence',
    CSD:      'Computer Science and Design',
    CSBCHAIN: 'CSE IoT Cyber Security Including Blockchain',
    '3DANIM': '3D Animation and Graphics',
    AR:       'Automation and Robotics',
    RM:       'Robotics and Mechatronics',
    RAI:      'Robotics and Artificial Intelligence',
    EV:       'Electric Vehicles',
    AME:      'Aircraft Maintenance Engineering',
    ECS:      'Electronics and Computer Science',
    MECH:     'Mechatronics Engineering',
    ECACT:    'Electronics and Communication (ACT)',
    VLSI:     'Electronics Engineering VLSI Design and Technology',

    // Special / Common
    COMMON:   'Common to All Branches',
  };
  const branchPart = parts.find(p => Object.keys(BRANCHES).includes(p));
  if (branchPart) meta.branch = BRANCHES[branchPart];

  // ── Semester ──────────────────────────────────────────────
  const semPart = parts.find(p => /^SEM\d+$/.test(p));
  if (semPart) meta.semester = parseInt(semPart.replace('SEM', ''), 10);

  // ── Year / Scheme ─────────────────────────────────────────
  const yearPart = parts.find(p => /^\d{4}$/.test(p));
  if (yearPart) {
    meta.year   = yearPart;
    meta.scheme = yearPart; // admission year = scheme for syllabus files
  }

  // ── Subject Code (PYQ files: e.g. CS501) ─────────────────
  const subjectPart = parts.find(p => /^[A-Z]{2,3}\d{3,4}$/.test(p));
  if (subjectPart) meta.subject = subjectPart;

  return meta;
}

// ── Main ──────────────────────────────────────────────────────

async function ingest() {
  console.log('══════════════════════════════════════════════');
  console.log(' RGPVMate — Document Ingestion Script');
  console.log('══════════════════════════════════════════════\n');

  // Get already-ingested sources so we can skip them
  let alreadyIngested = new Set();
  try {
    const existing = await listDocuments();
    alreadyIngested = new Set(existing.map(d => d.source));
    console.log(`📋 Already in ChromaDB: ${alreadyIngested.size} document(s)`);
    if (alreadyIngested.size > 0) {
      console.log([...alreadyIngested].map(s => `   • ${s}`).join('\n'));
    }
    console.log();
  } catch (err) {
    console.warn('⚠️  Could not reach ChromaDB to check existing docs. Will ingest all.\n');
  }

  let totalFiles = 0;
  let totalChunks = 0;
  let skipped = 0;

  // Walk each document type folder
  for (const [folder, docType] of Object.entries(FOLDER_TYPE_MAP)) {
    const folderPath = path.join(DOCS_ROOT, folder);

    if (!fs.existsSync(folderPath)) {
      console.log(`⚠️  Folder not found, skipping: ${folder}/`);
      continue;
    }

    const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
      console.log(`📂 ${folder}/ — empty, skipping`);
      continue;
    }

    console.log(`📂 Processing ${folder}/ — ${files.length} PDF(s)`);

    for (const filename of files) {
      const filePath = path.join(folderPath, filename);

      // Skip if already ingested
      if (alreadyIngested.has(filename)) {
        console.log(`   ⏭️  Skipping (already ingested): ${filename}`);
        skipped++;
        continue;
      }

      process.stdout.write(`   📄 ${filename} ... `);

      try {
        // 1. Extract raw text from PDF
        const buffer = fs.readFileSync(filePath);
        const parsed = await pdf(buffer);
        const rawText = parsed.text;

        if (!rawText || rawText.trim().length < 50) {
          console.log('⚠️  Too little text extracted, skipping');
          continue;
        }

        // 2. Parse metadata from filename
        const filenameMeta = parseFilenameMetadata(filename);
        const metadata = {
          source:   filename,
          type:     docType,
          ...filenameMeta,
        };

        // 3. Chunk the text
        const chunks = chunkDocument(rawText, docType, metadata);
        if (chunks.length === 0) {
          console.log('⚠️  No chunks produced, skipping');
          continue;
        }

        // 4. Embed each chunk (batch for efficiency)
        const texts = chunks.map(c => c.text);
        const batchResponse = await fetchBatchEmbeddings(texts);

        const chunksWithVectors = chunks.map((chunk, i) => ({
          ...chunk,
          vector: batchResponse[i],
        }));

        // 5. Store in ChromaDB
        await addChunks(chunksWithVectors);

        console.log(`✅ ${chunks.length} chunks`);
        totalFiles++;
        totalChunks += chunks.length;

      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
      }
    }
    console.log();
  }

  console.log('══════════════════════════════════════════════');
  console.log(` Ingestion Complete`);
  console.log(`   Files ingested : ${totalFiles}`);
  console.log(`   Files skipped  : ${skipped}`);
  console.log(`   Total chunks   : ${totalChunks}`);
  console.log('══════════════════════════════════════════════');
}

/**
 * Calls the Python embedder in batch mode for efficiency.
 * Falls back to individual calls if batch returns wrong count.
 */
async function fetchBatchEmbeddings(texts) {
  const axios = require('axios');
  try {
    const response = await axios.post(`${process.env.EMBEDDER_URL}/embed`, { text: texts });
    if (response.data.vectors && response.data.vectors.length === texts.length) {
      return response.data.vectors;
    }
  } catch (err) {
    console.warn('\n   ⚠️  Batch embed failed, falling back to individual calls:', err.message);
  }

  // Fallback: individual calls
  const vectors = [];
  for (const text of texts) {
    const response = await axios.post(`${process.env.EMBEDDER_URL}/embed`, { text });
    vectors.push(response.data.vector);
  }
  return vectors;
}

ingest().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});

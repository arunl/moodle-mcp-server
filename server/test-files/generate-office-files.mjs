/**
 * Generate test Office files (DOCX, XLSX, PPTX) with masked PII for testing unmasking
 */

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, BorderStyle, WidthType } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Sample masked PII data
const topPerformers = [
  { name: 'M19280:name', email: 'M19280:email', cid: 'M19280:CID', replies: 10 },
  { name: 'M18275:name', email: 'M18275:email', cid: 'M18275:CID', replies: 9 },
  { name: 'M40419:name', email: 'M40419:email', cid: 'M40419:CID', replies: 7 },
];

const nonParticipants = [
  { name: 'M19009:name', email: 'M19009:email' },
  { name: 'M1942:name', email: 'M1942:email' },
  { name: 'M35227:name', email: 'M35227:email' },
  { name: 'M20896:name', email: 'M20896:email' },
  { name: 'M65419:name', email: 'M65419:email' },
];

const teamAlpha = [
  { role: 'Lead', name: 'M34538:name', cid: 'M34538:CID' },
  { role: 'Member', name: 'M41292:name', cid: 'M41292:CID' },
  { role: 'Member', name: 'M33324:name', cid: 'M33324:CID' },
];

const teamBeta = [
  { role: 'Lead', name: 'M40240:name', cid: 'M40240:CID' },
  { role: 'Member', name: 'M54580:name', cid: 'M54580:CID' },
  { role: 'Member', name: 'M52118:name', cid: 'M52118:CID' },
];

const grades = [
  { cid: 'M34538:CID', name: 'M34538:name', hw: 95, forum: 100, total: 97 },
  { cid: 'M18275:CID', name: 'M18275:name', hw: 92, forum: 100, total: 95 },
  { cid: 'M41292:CID', name: 'M41292:name', hw: 88, forum: 90, total: 89 },
  { cid: 'M40240:CID', name: 'M40240:name', hw: 85, forum: 95, total: 89 },
];

// ============================================
// DOCX Generation
// ============================================
async function generateDocx() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: "CMPS453 Course Progress Report",
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Generated: ", bold: true }),
            new TextRun("January 25, 2026"),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Course: ", bold: true }),
            new TextRun("Intro to Software Methodology"),
          ],
        }),
        new Paragraph({ text: "" }),
        
        // Executive Summary
        new Paragraph({
          text: "Executive Summary",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [
            new TextRun("This report covers "),
            new TextRun({ text: "42 students", bold: true }),
            new TextRun(" enrolled in CMPS453. Notable performers include "),
            new TextRun({ text: "M34538:name", bold: true }),
            new TextRun(" and "),
            new TextRun({ text: "M18275:name", bold: true }),
            new TextRun(" who have shown excellent participation."),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun("The instructor "),
            new TextRun({ text: "M5741:name", bold: true }),
            new TextRun(" has noted that "),
            new TextRun({ text: "M19280:name", bold: true }),
            new TextRun(" leads the class with 10 forum replies."),
          ],
        }),
        new Paragraph({ text: "" }),

        // Top Performers
        new Paragraph({
          text: "Top Performers",
          heading: HeadingLevel.HEADING_1,
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Rank", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Student", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Email", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Replies", bold: true })] }),
              ],
            }),
            ...topPerformers.map((p, i) => new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(`${i + 1}`)] }),
                new TableCell({ children: [new Paragraph(p.name)] }),
                new TableCell({ children: [new Paragraph(p.email)] }),
                new TableCell({ children: [new Paragraph(`${p.replies}`)] }),
              ],
            })),
          ],
        }),
        new Paragraph({ text: "" }),

        // Non-Participants
        new Paragraph({
          text: "Non-Participants",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph("The following students have NOT posted in the Self-Introduction forum:"),
        ...nonParticipants.map(p => new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: p.name, bold: true }),
            new TextRun(` — Contact: ${p.email}`),
          ],
        })),
        new Paragraph({ text: "" }),

        // Team Assignments
        new Paragraph({
          text: "Team Assignments",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({ text: "Team Alpha", heading: HeadingLevel.HEADING_2 }),
        ...teamAlpha.map(m => new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${m.role}: `, bold: true }),
            new TextRun(`${m.name} (ID: ${m.cid})`),
          ],
        })),
        new Paragraph({ text: "Team Beta", heading: HeadingLevel.HEADING_2 }),
        ...teamBeta.map(m => new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${m.role}: `, bold: true }),
            new TextRun(`${m.name} (ID: ${m.cid})`),
          ],
        })),
        new Paragraph({ text: "" }),

        // Grade Summary
        new Paragraph({
          text: "Grade Summary",
          heading: HeadingLevel.HEADING_1,
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Student ID", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Name", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "HW Avg", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Forum", bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: "Total", bold: true })] }),
              ],
            }),
            ...grades.map(g => new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(g.cid)] }),
                new TableCell({ children: [new Paragraph(g.name)] }),
                new TableCell({ children: [new Paragraph(`${g.hw}`)] }),
                new TableCell({ children: [new Paragraph(`${g.forum}`)] }),
                new TableCell({ children: [new Paragraph(`${g.total}`)] }),
              ],
            })),
          ],
        }),
        new Paragraph({ text: "" }),

        // Footer
        new Paragraph({
          children: [
            new TextRun({ text: "Report prepared by: ", italics: true }),
            new TextRun({ text: "M5741:name", italics: true }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Questions? Contact: ", italics: true }),
            new TextRun({ text: "M5741:email", italics: true }),
          ],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const path = join(__dirname, 'progress-report.docx');
  writeFileSync(path, buffer);
  console.log(`✅ Generated: ${path}`);
  return buffer;
}

// ============================================
// XLSX Generation
// ============================================
async function generateXlsx() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'M5741:name';
  workbook.created = new Date();
  
  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 25 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  summarySheet.addRows([
    { field: 'Report Title', value: 'CMPS453 Course Progress Report' },
    { field: 'Generated', value: 'January 25, 2026' },
    { field: 'Course', value: 'Intro to Software Methodology' },
    { field: 'Total Students', value: 42 },
    { field: 'Instructor', value: 'M5741:name' },
    { field: 'Contact', value: 'M5741:email' },
    { field: 'Top Performer', value: 'M19280:name (10 replies)' },
    { field: 'Notable Students', value: 'M34538:name, M18275:name' },
  ]);
  
  // Top Performers Sheet
  const performersSheet = workbook.addWorksheet('Top Performers');
  performersSheet.columns = [
    { header: 'Rank', key: 'rank', width: 10 },
    { header: 'Student Name', key: 'name', width: 25 },
    { header: 'Student ID', key: 'cid', width: 20 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Forum Replies', key: 'replies', width: 15 },
  ];
  topPerformers.forEach((p, i) => {
    performersSheet.addRow({ rank: i + 1, name: p.name, cid: p.cid, email: p.email, replies: p.replies });
  });

  // Non-Participants Sheet
  const nonPartSheet = workbook.addWorksheet('Non-Participants');
  nonPartSheet.columns = [
    { header: 'Student Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Status', key: 'status', width: 20 },
  ];
  nonParticipants.forEach(p => {
    nonPartSheet.addRow({ name: p.name, email: p.email, status: 'No Introduction Posted' });
  });

  // Teams Sheet
  const teamsSheet = workbook.addWorksheet('Team Assignments');
  teamsSheet.columns = [
    { header: 'Team', key: 'team', width: 15 },
    { header: 'Role', key: 'role', width: 15 },
    { header: 'Student Name', key: 'name', width: 25 },
    { header: 'Student ID', key: 'cid', width: 20 },
  ];
  teamAlpha.forEach(m => {
    teamsSheet.addRow({ team: 'Alpha', role: m.role, name: m.name, cid: m.cid });
  });
  teamBeta.forEach(m => {
    teamsSheet.addRow({ team: 'Beta', role: m.role, name: m.name, cid: m.cid });
  });

  // Grades Sheet
  const gradesSheet = workbook.addWorksheet('Grades');
  gradesSheet.columns = [
    { header: 'Student ID', key: 'cid', width: 20 },
    { header: 'Student Name', key: 'name', width: 25 },
    { header: 'HW Average', key: 'hw', width: 12 },
    { header: 'Forum Score', key: 'forum', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
  ];
  grades.forEach(g => {
    gradesSheet.addRow(g);
  });

  // Style headers
  [summarySheet, performersSheet, nonPartSheet, teamsSheet, gradesSheet].forEach(sheet => {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2C3E50' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const path = join(__dirname, 'progress-report.xlsx');
  writeFileSync(path, Buffer.from(buffer));
  console.log(`✅ Generated: ${path}`);
  return Buffer.from(buffer);
}

// ============================================
// PPTX Generation  
// ============================================
async function generatePptx() {
  const pptx = new PptxGenJS();
  pptx.author = 'M5741:name';
  pptx.title = 'CMPS453 Course Progress Report';
  pptx.subject = 'Course Progress';
  
  // Title Slide
  let slide = pptx.addSlide();
  slide.addText('CMPS453 Course Progress Report', {
    x: 0.5, y: 2, w: 9, h: 1.5,
    fontSize: 36, bold: true, color: '2C3E50', align: 'center'
  });
  slide.addText('January 25, 2026', {
    x: 0.5, y: 3.5, w: 9, h: 0.5,
    fontSize: 18, color: '7F8C8D', align: 'center'
  });
  slide.addText('Prepared by: M5741:name', {
    x: 0.5, y: 4.2, w: 9, h: 0.5,
    fontSize: 14, color: '95A5A6', align: 'center', italic: true
  });

  // Executive Summary Slide
  slide = pptx.addSlide();
  slide.addText('Executive Summary', {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 28, bold: true, color: '2980B9'
  });
  slide.addText([
    { text: '42 students', options: { bold: true } },
    { text: ' enrolled in CMPS453\n\n' },
    { text: 'Top Performers: ', options: { bold: true } },
    { text: 'M34538:name and M18275:name\n\n' },
    { text: 'Most Active: ', options: { bold: true } },
    { text: 'M19280:name with 10 forum replies\n\n' },
    { text: 'Instructor: ', options: { bold: true } },
    { text: 'M5741:name' },
  ], { x: 0.5, y: 1.3, w: 9, h: 3.5, fontSize: 18, color: '2C3E50' });

  // Top Performers Slide
  slide = pptx.addSlide();
  slide.addText('🏆 Top Performers', {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 28, bold: true, color: '27AE60'
  });
  slide.addTable([
    [{ text: 'Rank', options: { bold: true, fill: '2C3E50', color: 'FFFFFF' } },
     { text: 'Student', options: { bold: true, fill: '2C3E50', color: 'FFFFFF' } },
     { text: 'Email', options: { bold: true, fill: '2C3E50', color: 'FFFFFF' } },
     { text: 'Replies', options: { bold: true, fill: '2C3E50', color: 'FFFFFF' } }],
    ['🥇 1st', 'M19280:name', 'M19280:email', '10'],
    ['🥈 2nd', 'M18275:name', 'M18275:email', '9'],
    ['🥉 3rd', 'M40419:name', 'M40419:email', '7'],
  ], { x: 0.5, y: 1.3, w: 9, colW: [1.2, 2.8, 3.5, 1.5], fontSize: 14 });

  // Non-Participants Slide
  slide = pptx.addSlide();
  slide.addText('⚠️ Non-Participants', {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 28, bold: true, color: 'E74C3C'
  });
  slide.addText('Students who have NOT posted in the Self-Introduction forum:', {
    x: 0.5, y: 1.1, w: 9, h: 0.5, fontSize: 16, color: '7F8C8D'
  });
  let yPos = 1.7;
  nonParticipants.forEach(p => {
    slide.addText(`• ${p.name} — ${p.email}`, {
      x: 0.7, y: yPos, w: 8.5, h: 0.4, fontSize: 16, color: '2C3E50'
    });
    yPos += 0.45;
  });

  // Team Assignments Slide
  slide = pptx.addSlide();
  slide.addText('👥 Team Assignments', {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 28, bold: true, color: '9B59B6'
  });
  
  // Team Alpha
  slide.addText('Team Alpha', { x: 0.5, y: 1.2, w: 4, h: 0.5, fontSize: 20, bold: true, color: '2C3E50' });
  yPos = 1.7;
  teamAlpha.forEach(m => {
    slide.addText(`${m.role}: ${m.name} (${m.cid})`, {
      x: 0.7, y: yPos, w: 4, h: 0.35, fontSize: 14, color: '34495E'
    });
    yPos += 0.4;
  });
  
  // Team Beta
  slide.addText('Team Beta', { x: 5, y: 1.2, w: 4, h: 0.5, fontSize: 20, bold: true, color: '2C3E50' });
  yPos = 1.7;
  teamBeta.forEach(m => {
    slide.addText(`${m.role}: ${m.name} (${m.cid})`, {
      x: 5.2, y: yPos, w: 4, h: 0.35, fontSize: 14, color: '34495E'
    });
    yPos += 0.4;
  });

  // Grades Slide
  slide = pptx.addSlide();
  slide.addText('📋 Grade Summary', {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 28, bold: true, color: 'F39C12'
  });
  slide.addTable([
    [{ text: 'Student ID', options: { bold: true, fill: '34495E', color: 'FFFFFF' } },
     { text: 'Name', options: { bold: true, fill: '34495E', color: 'FFFFFF' } },
     { text: 'HW', options: { bold: true, fill: '34495E', color: 'FFFFFF' } },
     { text: 'Forum', options: { bold: true, fill: '34495E', color: 'FFFFFF' } },
     { text: 'Total', options: { bold: true, fill: '34495E', color: 'FFFFFF' } }],
    ...grades.map(g => [g.cid, g.name, `${g.hw}`, `${g.forum}`, `${g.total}`]),
  ], { x: 0.5, y: 1.3, w: 9, colW: [2, 2.5, 1.5, 1.5, 1.5], fontSize: 14 });

  // Contact Slide
  slide = pptx.addSlide();
  slide.addText('Questions?', {
    x: 0.5, y: 2, w: 9, h: 1,
    fontSize: 36, bold: true, color: '2C3E50', align: 'center'
  });
  slide.addText('Contact: M5741:email', {
    x: 0.5, y: 3.2, w: 9, h: 0.6,
    fontSize: 20, color: '3498DB', align: 'center'
  });
  slide.addText('Report prepared by M5741:name', {
    x: 0.5, y: 4, w: 9, h: 0.5,
    fontSize: 14, color: '95A5A6', align: 'center', italic: true
  });

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  const path = join(__dirname, 'progress-report.pptx');
  writeFileSync(path, buffer);
  console.log(`✅ Generated: ${path}`);
  return buffer;
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('🔧 Generating Office files with masked PII...\n');
  
  const docxBuffer = await generateDocx();
  const xlsxBuffer = await generateXlsx();
  const pptxBuffer = await generatePptx();
  
  console.log('\n✅ All files generated in test-files/ directory');
  console.log('\nBase64 outputs for upload:');
  console.log('\n--- DOCX (first 100 chars) ---');
  console.log(docxBuffer.toString('base64').substring(0, 100) + '...');
  console.log('\n--- XLSX (first 100 chars) ---');
  console.log(xlsxBuffer.toString('base64').substring(0, 100) + '...');
  console.log('\n--- PPTX (first 100 chars) ---');
  console.log(pptxBuffer.toString('base64').substring(0, 100) + '...');
  
  // Write base64 versions for easy copy
  writeFileSync(join(__dirname, 'progress-report.docx.b64'), docxBuffer.toString('base64'));
  writeFileSync(join(__dirname, 'progress-report.xlsx.b64'), xlsxBuffer.toString('base64'));
  writeFileSync(join(__dirname, 'progress-report.pptx.b64'), pptxBuffer.toString('base64'));
  
  console.log('\n✅ Base64 files also written (.b64 extension)');
}

main().catch(console.error);

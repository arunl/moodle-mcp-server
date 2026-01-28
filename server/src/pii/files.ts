/**
 * File Masking/Unmasking Module
 * 
 * Mask and unmask PII in various file formats:
 * - CSV, TSV, TXT: Plain text replacement
 * - DOCX, XLSX, PPTX: ZIP archives with XML content
 * 
 * Usage:
 *   const masked = await maskFile(buffer, filename, roster);
 *   const unmasked = await unmaskFile(buffer, filename, roster);
 *   // Returns { buffer: Buffer, filename: string, mimeType: string }
 */

import AdmZip from 'adm-zip';
import { maskPII, unmaskPII } from './mask.js';
import type { PiiRosterEntry } from './schema.js';

export interface UnmaskedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * File type detection based on extension and magic bytes
 */
type FileType = 'csv' | 'tsv' | 'txt' | 'docx' | 'xlsx' | 'pptx' | 'unknown';

const MIME_TYPES: Record<FileType, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  unknown: 'application/octet-stream',
};

/**
 * Detect file type from filename extension
 */
function detectFileType(filename: string): FileType {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'csv': return 'csv';
    case 'tsv': return 'tsv';
    case 'txt': return 'txt';
    case 'docx': return 'docx';
    case 'xlsx': return 'xlsx';
    case 'pptx': return 'pptx';
    default: return 'unknown';
  }
}

export interface MaskedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Mask a file - replace PII with tokens
 * This is the reverse of unmaskFile
 */
export async function maskFile(
  buffer: Buffer,
  filename: string,
  roster: PiiRosterEntry[]
): Promise<MaskedFile> {
  const fileType = detectFileType(filename);
  
  let maskedBuffer: Buffer;
  
  switch (fileType) {
    case 'csv':
    case 'tsv':
    case 'txt':
      maskedBuffer = maskTextFile(buffer, roster);
      break;
    
    case 'docx':
    case 'xlsx':
    case 'pptx':
      maskedBuffer = maskOfficeDocument(buffer, roster, fileType);
      break;
    
    default:
      // Unknown format - try as text, fall back to unchanged
      try {
        maskedBuffer = maskTextFile(buffer, roster);
      } catch {
        maskedBuffer = buffer;
      }
  }
  
  return {
    buffer: maskedBuffer,
    filename,
    mimeType: MIME_TYPES[fileType],
  };
}

/**
 * Unmask a file based on its type
 */
export async function unmaskFile(
  buffer: Buffer,
  filename: string,
  roster: PiiRosterEntry[]
): Promise<UnmaskedFile> {
  const fileType = detectFileType(filename);
  
  let unmaskedBuffer: Buffer;
  
  switch (fileType) {
    case 'csv':
    case 'tsv':
    case 'txt':
      unmaskedBuffer = unmaskTextFile(buffer, roster);
      break;
    
    case 'docx':
    case 'xlsx':
    case 'pptx':
      unmaskedBuffer = unmaskOfficeDocument(buffer, roster, fileType);
      break;
    
    default:
      // Unknown format - try as text, fall back to unchanged
      try {
        unmaskedBuffer = unmaskTextFile(buffer, roster);
      } catch {
        unmaskedBuffer = buffer;
      }
  }
  
  return {
    buffer: unmaskedBuffer,
    filename,
    mimeType: MIME_TYPES[fileType],
  };
}

/**
 * Mask plain text files (CSV, TSV, TXT)
 */
function maskTextFile(buffer: Buffer, roster: PiiRosterEntry[]): Buffer {
  const text = buffer.toString('utf-8');
  const masked = maskPII(text, roster);
  return Buffer.from(masked, 'utf-8');
}

/**
 * Unmask plain text files (CSV, TSV, TXT)
 */
function unmaskTextFile(buffer: Buffer, roster: PiiRosterEntry[]): Buffer {
  const text = buffer.toString('utf-8');
  const unmasked = unmaskPII(text, roster);
  return Buffer.from(unmasked, 'utf-8');
}

/**
 * Mask Office documents (DOCX, XLSX, PPTX)
 * 
 * These are ZIP archives containing XML files.
 * We extract, mask XML content, and repackage.
 */
function maskOfficeDocument(
  buffer: Buffer,
  roster: PiiRosterEntry[],
  fileType: 'docx' | 'xlsx' | 'pptx'
): Buffer {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  
  // Define which XML files contain content for each format
  const contentPatterns: Record<string, RegExp[]> = {
    docx: [
      /^word\/document\.xml$/,
      /^word\/header\d*\.xml$/,
      /^word\/footer\d*\.xml$/,
    ],
    xlsx: [
      /^xl\/worksheets\/sheet\d+\.xml$/,
      /^xl\/sharedStrings\.xml$/,  // Shared strings table
    ],
    pptx: [
      /^ppt\/slides\/slide\d+\.xml$/,
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/,
    ],
  };
  
  const patterns = contentPatterns[fileType];
  
  for (const entry of entries) {
    // Check if this entry matches any content pattern
    const shouldMask = patterns.some(pattern => pattern.test(entry.entryName));
    
    if (shouldMask) {
      const content = entry.getData().toString('utf-8');
      const masked = maskPII(content, roster);
      
      // Update the entry with masked content
      zip.updateFile(entry.entryName, Buffer.from(masked, 'utf-8'));
    }
  }
  
  return zip.toBuffer();
}

/**
 * Unmask Office documents (DOCX, XLSX, PPTX)
 * 
 * These are ZIP archives containing XML files.
 * We extract, unmask XML content, and repackage.
 */
function unmaskOfficeDocument(
  buffer: Buffer,
  roster: PiiRosterEntry[],
  fileType: 'docx' | 'xlsx' | 'pptx'
): Buffer {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  
  // Define which XML files contain content for each format
  const contentPatterns: Record<string, RegExp[]> = {
    docx: [
      /^word\/document\.xml$/,
      /^word\/header\d*\.xml$/,
      /^word\/footer\d*\.xml$/,
    ],
    xlsx: [
      /^xl\/worksheets\/sheet\d+\.xml$/,
      /^xl\/sharedStrings\.xml$/,  // Shared strings table
    ],
    pptx: [
      /^ppt\/slides\/slide\d+\.xml$/,
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/,
    ],
  };
  
  const patterns = contentPatterns[fileType];
  
  for (const entry of entries) {
    // Check if this entry matches any content pattern
    const shouldUnmask = patterns.some(pattern => pattern.test(entry.entryName));
    
    if (shouldUnmask) {
      const content = entry.getData().toString('utf-8');
      const unmasked = unmaskPII(content, roster);
      
      // Update the entry with unmasked content
      zip.updateFile(entry.entryName, Buffer.from(unmasked, 'utf-8'));
    }
  }
  
  return zip.toBuffer();
}

/**
 * Generate a CSV from masked data and unmask it
 * Useful when LLM generates a table that needs to be exported
 */
export function generateUnmaskedCSV(
  headers: string[],
  rows: string[][],
  roster: PiiRosterEntry[]
): string {
  // Build CSV with masked data
  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.map(cell => escapeCSV(cell)).join(','))
  ];
  
  const maskedCSV = csvLines.join('\n');
  
  // Unmask and return
  return unmaskPII(maskedCSV, roster);
}

/**
 * Escape a CSV cell value
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parse a masked CSV and return unmasked data structure
 */
export function parseAndUnmaskCSV(
  csvContent: string,
  roster: PiiRosterEntry[]
): { headers: string[]; rows: string[][] } {
  // First unmask the entire content
  const unmasked = unmaskPII(csvContent, roster);
  
  // Simple CSV parsing (doesn't handle all edge cases)
  const lines = unmasked.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    
    return cells;
  };
  
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  
  return { headers, rows };
}

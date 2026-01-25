#!/usr/bin/env node
/**
 * Generate version.json with git commit info
 * 
 * Run before build: node scripts/generate-version.js
 * This file is read by the server at startup.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getGitInfo() {
  try {
    const commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const commitShort = commitSha.slice(0, 7);
    const commitDate = execSync('git log -1 --format=%cI', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    
    return {
      commit: commitShort,
      commitFull: commitSha,
      commitDate,
      branch,
      buildDate: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Warning: Could not get git info:', error.message);
    return {
      commit: 'unknown',
      commitFull: 'unknown',
      commitDate: null,
      branch: 'unknown',
      buildDate: new Date().toISOString(),
    };
  }
}

const versionInfo = getGitInfo();
const outputPath = join(__dirname, '..', 'version.json');

writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));
console.log(`✅ Generated version.json: v${versionInfo.commit} (${versionInfo.branch})`);

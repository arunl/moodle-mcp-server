#!/usr/bin/env node
/**
 * Generate version.json with git commit info
 * 
 * Run before build: node scripts/generate-version.js
 * This file is read by the server at startup.
 * 
 * Priority:
 * 1. Environment variables (COMMIT_SHA, BUILD_DATE) - set by CI/CD
 * 2. Git commands - for local development
 * 3. Fallback to "unknown"
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = join(__dirname, '..', 'version.json');

function getVersionInfo() {
  // Priority 1: Check if version.json already exists with valid commit (created by Dockerfile)
  if (existsSync(outputPath)) {
    try {
      const existing = JSON.parse(readFileSync(outputPath, 'utf-8'));
      if (existing.commit && existing.commit !== 'unknown' && existing.commitFull && existing.commitFull !== 'unknown') {
        console.log(`✅ Using existing version.json: v${existing.commit}`);
        return null; // Don't overwrite
      }
    } catch {
      // Invalid JSON, regenerate
    }
  }

  // Priority 2: Environment variables (set by CI/CD build args)
  const envCommit = process.env.COMMIT_SHA;
  const envBuildDate = process.env.BUILD_DATE;
  
  if (envCommit && envCommit !== 'unknown') {
    console.log(`Using environment variables for version info`);
    return {
      commit: envCommit.slice(0, 7),
      commitFull: envCommit,
      commitDate: null,
      branch: 'master',
      buildDate: envBuildDate || new Date().toISOString(),
    };
  }

  // Priority 3: Git commands (local development)
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

const versionInfo = getVersionInfo();

if (versionInfo) {
  writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));
  console.log(`✅ Generated version.json: v${versionInfo.commit} (${versionInfo.branch})`);
}

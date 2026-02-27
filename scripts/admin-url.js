#!/usr/bin/env node
/**
 * Generates the admin dashboard URL for local dev.
 * Run: npm run admin-url
 *
 * For production, replace SITE_URL with your live domain.
 */

const { createHmac } = require('crypto');
const { readFileSync } = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.dev.vars');
let env = {};
try {
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .forEach(l => {
      const idx = l.indexOf('=');
      env[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
    });
} catch {
  console.error('Could not read .dev.vars — copy .dev.vars.example and fill in values.');
  process.exit(1);
}

const secret = env.APPROVE_SECRET;
if (!secret || secret === 'change-me-to-a-long-random-string') {
  console.error('Set APPROVE_SECRET in .dev.vars before generating the admin URL.');
  process.exit(1);
}

const token   = createHmac('sha256', secret).update('admin-bookings').digest('hex');
const siteUrl = env.SITE_URL || 'http://localhost:8788';

console.log('\nAdmin dashboard URL:');
console.log(`${siteUrl}/api/admin/bookings?token=${token}`);
console.log('\nBookmark this URL — it is tied to your APPROVE_SECRET.\n');

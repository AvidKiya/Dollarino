#!/usr/bin/env node
// Fails the build/CI when a release version drifts across surfaces.
// This is the guard that would have caught the "UI on V11.7.2 but the deployed Worker
// still running an older build" mismatch that produced:
//   `404 Route not found: /api/trading/accept-risk-terms`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function grab(label, file, regex) {
  const m = read(file).match(regex);
  return { label, kind: 'version', file, value: m ? m[1] : null };
}

function assertTrue(label, file, predicate) {
  let ok = false;
  try {
    ok = predicate(read(file));
  } catch {
    ok = false;
  }
  return { label, kind: 'assert', file, value: ok ? 'ok' : 'MISSING' };
}

const versionChecks = [
  grab('Worker runtime version', 'apps/worker/src/version.ts', /DOLLARINO_VERSION\s*=\s*'([^']+)'/),
  grab('Web APP_VERSION', 'apps/web/src/lib/version.ts', /APP_VERSION\s*=\s*'([^']+)'/),
  grab('PWA cache name', 'apps/web/public/sw.js', /dollarino-pwa-v([\d.]+)/),
  grab('Chrome extension manifest', 'apps/extension/manifest.json', /"version"\s*:\s*"([^"]+)"/),
];

const assertionChecks = [
  assertTrue('Worker /api/health serves the constant', 'apps/worker/src/index.ts', (s) =>
    /version:\s*DOLLARINO_VERSION/.test(s) && !/version:\s*'\d+\.\d+\.\d+'/.test(s)
  ),
  assertTrue('Web PWA cache derives from APP_VERSION', 'apps/web/src/main.tsx', (s) =>
    /dollarino-pwa-v\$\{APP_VERSION\}/.test(s)
  ),
];

console.log('Dollarino version guard');
for (const c of [...versionChecks, ...assertionChecks]) {
  const mark = c.value && c.value !== 'MISSING' ? '•' : '✖';
  console.log(`  ${mark} ${c.label.padEnd(38)} ${String(c.value).padEnd(18)} (${c.file})`);
}

const missing = [...versionChecks, ...assertionChecks].filter((c) => !c.value || c.value === 'MISSING');
const versions = new Set(versionChecks.map((c) => c.value));

if (missing.length || versions.size > 1) {
  if (versions.size > 1) {
    console.error(`\n✖ Version drift: ${[...versions].join(' vs ')}`);
  }
  console.error('✖ Fix with: node scripts/sync-version.mjs <version>');
  process.exit(1);
}

console.log(`\n✓ All surfaces on ${[...versions][0]}`);

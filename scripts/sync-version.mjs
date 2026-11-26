#!/usr/bin/env node
// Keeps the release version in sync across every surface that exposes it.
//
// Usage:
//   node scripts/sync-version.mjs            # sync from apps/worker/src/version.ts
//   node scripts/sync-version.mjs 11.8.0     # bump everything to a new version
//
// Sources of truth: `apps/worker/src/version.ts` (DOLLARINO_VERSION).
// Targets synced here:
//   - apps/web/src/lib/version.ts            (APP_VERSION / ASSET_VERSION)
//   - apps/web/src/main.tsx                  (SW cache name)
//   - apps/web/public/sw.js                  (SW cache name)
//   - apps/extension/manifest.json           ("version")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);

const WORKER_VERSION_FILE = 'apps/worker/src/version.ts';
const explicit = process.argv[2];

let version = explicit;
if (!version) {
  const m = read(WORKER_VERSION_FILE).match(/DOLLARINO_VERSION\s*=\s*'([^']+)'/);
  if (!m) {
    console.error(`✖ Could not read DOLLARINO_VERSION from ${WORKER_VERSION_FILE}`);
    process.exit(1);
  }
  version = m[1];
}
if (!/^\d+\.\d+\.\d+$/i.test(version)) {
  console.error(`✖ Invalid version "${version}" (expected e.g. 11.7.2)`);
  process.exit(1);
}

const assetVersion = version.replace(/\./g, '');
const pwaCache = `dollarino-pwa-v${version}`;
const changed = [];

function patch(file, transform) {
  const before = read(file);
  const after = transform(before);
  if (after !== before) {
    write(file, after);
    changed.push(file);
  }
}

patch(WORKER_VERSION_FILE, (s) =>
  s.replace(/(DOLLARINO_VERSION\s*=\s*')[^']+(')/, `$1${version}$2`)
);

patch('apps/web/src/lib/version.ts', (s) =>
  s
    .replace(/(APP_VERSION\s*=\s*')[^']+(')/, `$1${version}$2`)
    .replace(/(ASSET_VERSION\s*=\s*APP_VERSION\.replace\(\/\\\.\/g, ''\);)/, '$1')
);

patch('apps/web/src/main.tsx', (s) =>
  s
    .replace(/dollarino-pwa-v[\d.]+/g, pwaCache)
    .replace(/dollarino_sw_reloaded_v[\d]+/g, `dollarino_sw_reloaded_v${assetVersion}`)
);

patch('apps/web/public/sw.js', (s) => s.replace(/dollarino-pwa-v[\d.]+/g, pwaCache));

patch('apps/extension/manifest.json', (s) => s.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`));

if (changed.length === 0) {
  console.log(`✓ Everything already on ${version}`);
} else {
  console.log(`✓ Synced version ${version} across:\n${changed.map((f) => `   - ${f}`).join('\n')}`);
}
console.log(`  PWA cache: ${pwaCache} · asset query: ?v=${assetVersion}`);

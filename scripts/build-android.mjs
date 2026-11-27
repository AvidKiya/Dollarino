#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const webDistDir = path.join(rootDir, 'apps', 'web', 'dist');
const androidDir = path.join(rootDir, 'apps', 'android');
const androidAssetsPublicDir = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public');

const args = new Set(process.argv.slice(2));
const skipWebBuild = args.has('--skip-web-build');
const runGradle = args.has('--gradle') || args.has('--apk');
const releaseMode = args.has('--release');

function copyRecursiveSync(src, dest, relPath = '') {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    // Skip desktop browser extension zip bundles when packaging the native Android APK
    if (relPath === 'downloads' || relPath === 'widgets') return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const nextRel = relPath ? `${relPath}/${entry}` : entry;
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry), nextRel);
    }
  } else {
    // Keep Android APK lightweight: inside images/, skip legacy PNG/JPG copies whenever a WebP sibling exists
    if (relPath.startsWith('images/') && /\.(png|jpe?g)$/i.test(src)) {
      const webpSibling = src.replace(/\.(png|jpe?g)$/i, '.webp');
      if (fs.existsSync(webpSibling)) return;
    }
    if (relPath === 'dollarino-preview.jpg' || relPath === 'logo.png') return;
    fs.copyFileSync(src, dest);
  }
}

console.log('[Dollarino Android] Step 1/3: Running version guard...');
execSync('node scripts/version-guard.mjs', { cwd: rootDir, stdio: 'inherit' });

if (!skipWebBuild) {
  console.log('[Dollarino Android] Step 2/3: Building production mobile UI bundle...');
  execSync('npm run build --workspace=packages/core && npm run build --workspace=apps/web', {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

if (!fs.existsSync(path.join(webDistDir, 'index.html'))) {
  console.error('[Dollarino Android] Error: apps/web/dist/index.html missing. Run without --skip-web-build.');
  process.exit(1);
}

console.log('[Dollarino Android] Step 3/3: Syncing compiled assets into apps/android/app/src/main/assets/public...');
fs.rmSync(androidAssetsPublicDir, { recursive: true, force: true });
copyRecursiveSync(webDistDir, androidAssetsPublicDir);

// Record build metadata for diagnostics inside APK
const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const buildMeta = {
  version: rootPkg.version || '11.7.2',
  syncedAt: new Date().toISOString(),
  apiBaseDefault: process.env.DOLLARINO_API_BASE || 'https://dollarino.pages.dev',
};
fs.writeFileSync(
  path.join(androidAssetsPublicDir, 'android-bundle-meta.json'),
  JSON.stringify(buildMeta, null, 2)
);

const bundledFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full);
    else bundledFiles.push(full);
  }
})(androidAssetsPublicDir);

console.log(`[Dollarino Android] Bundled ${bundledFiles.length} local web/UI files (v${buildMeta.version}) into Android APK assets.`);

if (runGradle) {
  const gradlew = fs.existsSync(path.join(androidDir, 'gradlew')) ? './gradlew' : 'gradle';
  const task = releaseMode ? 'assembleRelease' : 'assembleDebug';
  console.log(`[Dollarino Android] Running ${gradlew} ${task}...`);
  execSync(`${gradlew} ${task}`, { cwd: androidDir, stdio: 'inherit' });
} else {
  console.log('[Dollarino Android] Asset bundle ready! Open apps/android in Android Studio or run `gradle assembleDebug` (or pass --gradle) to compile the APK.');
}

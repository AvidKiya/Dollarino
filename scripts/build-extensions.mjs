#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'apps', 'extension');
const downloadsDir = path.join(root, 'apps', 'web', 'public', 'downloads');
const exportsDir = '/home/user/exports';
const tmpStageRoot = path.join(root, '.tmp_ext_build');

const INCLUDE_ITEMS = [
  'app.js',
  'background.js',
  'popup.html',
  'popup.css',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'README.md',
  'fonts',
  'icons',
];

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function buildTarget(targetName, manifestSrcPath, outZipPaths) {
  const stageDir = path.join(tmpStageRoot, targetName);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  const manifestRaw = fs.readFileSync(manifestSrcPath, 'utf8');
  JSON.parse(manifestRaw); // Validate valid JSON
  fs.writeFileSync(path.join(stageDir, 'manifest.json'), manifestRaw);

  for (const item of INCLUDE_ITEMS) {
    const src = path.join(extDir, item);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing extension file: ${src}`);
    }
    copyRecursive(src, path.join(stageDir, item));
  }

  const builtZip = path.join(tmpStageRoot, `${targetName}.zip`);
  fs.rmSync(builtZip, { force: true });
  execFileSync('zip', ['-r', '-q', builtZip, '.'], { cwd: stageDir });

  for (const destZip of outZipPaths) {
    fs.mkdirSync(path.dirname(destZip), { recursive: true });
    fs.copyFileSync(builtZip, destZip);
    console.log(`Built ${targetName}: ${destZip} (${fs.statSync(destZip).size} bytes)`);
  }
}

try {
  fs.rmSync(tmpStageRoot, { recursive: true, force: true });
  fs.mkdirSync(tmpStageRoot, { recursive: true });

  buildTarget('chrome', path.join(extDir, 'manifest.json'), [
    path.join(downloadsDir, 'dollarino-extension.zip'),
    path.join(downloadsDir, 'dollarino-extension-chrome.zip'),
    path.join(exportsDir, 'dollarino-extension-chrome-v11.9.1.zip'),
  ]);

  buildTarget('edge', path.join(extDir, 'manifests', 'manifest.edge.json'), [
    path.join(downloadsDir, 'dollarino-extension-edge.zip'),
    path.join(exportsDir, 'dollarino-extension-edge-v11.9.1.zip'),
  ]);

  buildTarget('firefox', path.join(extDir, 'manifests', 'manifest.firefox.json'), [
    path.join(downloadsDir, 'dollarino-extension-firefox.zip'),
    path.join(exportsDir, 'dollarino-extension-firefox-v11.9.1.zip'),
  ]);
} finally {
  fs.rmSync(tmpStageRoot, { recursive: true, force: true });
}

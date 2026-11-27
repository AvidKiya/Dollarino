#!/usr/bin/env node
/**
 * CI test runner with first-class failure reporting.
 *
 * Why this exists:
 *   GitHub Actions job logs are served from short-lived signed blob URLs. Some
 *   environments (including the agent sandbox that maintains this repo) cannot read
 *   them, so a red `npm test` gave no suite name and no assertion message. Workflow
 *   *annotations* are always readable through the REST API.
 *
 * What it does:
 *   - runs every workspace that has a `test` script (packages/core, apps/worker)
 *   - streams the normal human-readable vitest output to the job log
 *   - parses vitest's JSON report and emits, for each failed test, an annotation with
 *     the suite name, the test name and the full assertion message (deduplicated,
 *     capped so GitHub never rejects the payload)
 *   - exits non-zero if any workspace failed, so the step stays red
 *
 * No test is skipped, no assertion is relaxed: this only changes *reporting*.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACES = ['packages/core', 'apps/worker'];
const MAX_ANNOTATIONS = 40;
const MAX_MESSAGE = 3500;

/** Escape a value for the workflow-command annotation format. */
function escapeData(value) {
  return String(value ?? '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function escapeProp(value) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function annotate(level, title, message) {
  const text = String(message ?? '').slice(0, MAX_MESSAGE);
  console.log(`::${level} title=${escapeProp(title)}::${escapeData(text)}`);
}

function relative(dir) {
  return path.relative(root, dir) || '.';
}

function readResults(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Extract assertion failures from a vitest JSON report. */
function collectFailures(report) {
  const failures = [];
  for (const testFile of report?.testResults ?? []) {
    const file = testFile.name ? relative(path.resolve(root, testFile.name)) : 'unknown file';
    for (const assertion of testFile.assertionResults ?? []) {
      if (assertion.status !== 'failed') continue;
      const ancestors = (assertion.ancestorTitles ?? []).join(' > ');
      const suite = ancestors ? `${ancestors} > ${assertion.title}` : assertion.title;
      const messages = (assertion.failureMessages ?? []).join('\n');
      failures.push({ file, suite, messages });
    }
  }
  // vitest can also report file-level errors (import/setup crashes) without assertions.
  for (const testFile of report?.testResults ?? []) {
    const failed = (testFile.assertionResults ?? []).every((a) => a.status !== 'failed');
    if (testFile.status === 'failed' && failed) {
      failures.push({
        file: testFile.name ? relative(path.resolve(root, testFile.name)) : 'unknown file',
        suite: 'file-level failure (import/setup)',
        messages: testFile.message ?? 'No assertion message reported.',
      });
    }
  }
  return failures;
}

/** Trim vitest's long stack traces to the parts that identify the bug. */
function summarize(message) {
  const lines = message.split('\n').map((l) => l.trimEnd());
  const keep = [];
  for (const line of lines) {
    if (/^(at |❯ |\s+at )/.test(line) && keep.length > 0) continue; // drop stack frames
    if (!line.trim()) continue;
    keep.push(line);
    if (keep.length >= 18) break;
  }
  return keep.join('\n');
}

let failed = false;
const allFailures = [];
const workspaceSummary = [];

for (const workspace of WORKSPACES) {
  const dir = path.join(root, workspace);
  const reportFile = path.join(os.tmpdir(), `vitest-${workspace.replace(/[\\/]/g, '-')}.json`);
  fs.rmSync(reportFile, { force: true });

  console.log(`\n================ ${workspace} ================`);
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--maxWorkers=2', '--testTimeout=15000', '--reporter=default', '--reporter=json', `--outputFile.json=${reportFile}`],
    { cwd: dir, stdio: 'inherit', env: { ...process.env, CI: process.env.CI ?? 'true' }, shell: false }
  );

  const report = readResults(reportFile);
  const failures = report ? collectFailures(report) : [];
  const total = report?.numTotalTests ?? '?';
  const passed = report?.numPassedTests ?? '?';

  if (failures.length > 0) allFailures.push(...failures);
  if (result.status !== 0) {
    failed = true;
    if (!report) {
      allFailures.push({
        file: workspace,
        suite: 'vitest did not produce a report (crashed before running tests)',
        messages: `exit code ${result.status ?? 'unknown'}${
          result.error ? ` — ${result.error.message}` : ''
        }`,
      });
    }
  }
  workspaceSummary.push(
    `${workspace}: ${passed}/${total} passed, ${failures.length} failed, exit=${result.status}`
  );
}

console.log('\n================ SUMMARY ================');
for (const line of workspaceSummary) console.log(line);

if (allFailures.length > 0) {
  const shown = allFailures.slice(0, MAX_ANNOTATIONS);
  for (const failure of shown) {
    annotate('error', `${failure.file} :: ${failure.suite}`, summarize(failure.messages));
  }
  if (allFailures.length > shown.length) {
    annotate(
      'warning',
      'More failures not shown',
      `${allFailures.length - shown.length} additional failing tests were truncated. See the job log for the full list.`
    );
  }
  // One extra annotation summarizing every failing suite, so it is readable at a glance.
  annotate(
    'error',
    `Tests failed (${allFailures.length})`,
    allFailures.map((f) => `${f.file} :: ${f.suite}`).join('\n')
  );
} else if (failed) {
  annotate('error', 'Tests failed without a parseable report', workspaceSummary.join('\n'));
} else {
  annotate('notice', 'All tests passed', workspaceSummary.join('\n'));
}

process.exit(failed || allFailures.length > 0 ? 1 : 0);

import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { TSX_CLI } from '../../src/tool-paths.js';

const exec = promisify(execFile);
const REPO = resolve(process.cwd());

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a harness CLI the way a person or CI actually runs it — a real process, real
 * arguments, a real exit code. Asserting on the exit code matters: CI branches on it,
 * and a CLI that prints an error but exits 0 is a check that silently passes.
 */
const TSX = TSX_CLI;

async function cli(script: string, args: string[] = []): Promise<CliResult> {
  try {
    // Invoke node against tsx's entry point rather than the `npx` shim: on Windows
    // a .cmd shim through execFile without a shell fails with EINVAL, and using a
    // shell would mean concatenating arguments instead of escaping them.
    const { stdout, stderr } = await exec(
      process.execPath,
      [TSX, join('src', 'cli', script), ...args],
      { cwd: REPO, windowsHide: true },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number | string; stdout?: string; stderr?: string };
    if (typeof e.code === 'string') {
      throw new Error(`could not spawn the CLI (${e.code}) — the test harness is broken`);
    }
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'harness-int-'));
}

const HONEST_REPORT = `---
report: testability
target: apps/example
date: 2026-09-10
author: integration-test
confidence: high
evidence:
  direct: 1
  inferred: 0
  claimed: 0
findings:
  - id: F1
    severity: major
    evidence: direct
    summary: The primary action has no stable selector.
    basis: Selector ladder in docs/conventions.md
not_covered:
  - mobile viewports
not_run: []
---

Body.
`;

const DISHONEST_REPORT = HONEST_REPORT.replace(
  '    severity: major\n    evidence: direct',
  '    severity: blocker\n    evidence: claimed',
);

test.describe('check-report CLI', () => {
  test('should accept an honest report and exit 0', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'good.md'), HONEST_REPORT, 'utf8');

    const result = await cli('check-report.ts', [dir]);

    expect(result.code, 'an honest report was rejected — the checker is too strict to trust').toBe(
      0,
    );
    expect(result.stdout).toContain('0 error(s)');
    await rm(dir, { recursive: true, force: true });
  });

  test('should reject a blocker built on claimed evidence and exit 1', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'bad.md'), DISHONEST_REPORT, 'utf8');

    const result = await cli('check-report.ts', [dir]);

    expect(
      result.code,
      'a blocker resting on claimed evidence was accepted — the format stops meaning anything',
    ).toBe(1);
    expect(result.stdout).toContain('ERROR');
    await rm(dir, { recursive: true, force: true });
  });

  // Regression for the first CI failure: an explicitly named path that does not
  // exist crashed with an unhandled ENOENT and a stack trace.
  test('should fail cleanly when an explicitly named path does not exist', async () => {
    const result = await cli('check-report.ts', ['definitely/not/here']);

    expect(result.code, 'a named path that is absent must be an error, not a pass').toBe(2);
    expect(result.stderr).toContain('No reports found');
    expect(result.stderr, 'should explain, not dump a stack trace').not.toContain('at async');
  });

  test('should accept a single file path as well as a directory', async () => {
    const dir = await tempDir();
    const file = join(dir, 'one.md');
    await writeFile(file, HONEST_REPORT, 'utf8');

    const result = await cli('check-report.ts', [file]);

    expect(result.code, 'a single file path was not accepted, only directories').toBe(0);
    expect(result.stdout).toContain('1 report(s)');
    await rm(dir, { recursive: true, force: true });
  });
});

test.describe('gate CLI', () => {
  async function resultsFile(
    dir: string,
    stats: Record<string, unknown>,
    startTime = new Date().toISOString(),
  ): Promise<string> {
    const path = join(dir, 'results.json');
    await writeFile(path, JSON.stringify({ stats: { startTime, ...stats }, suites: [] }), 'utf8');
    return path;
  }

  test('should fail cleanly when there are no results at all', async () => {
    const result = await cli('gate.ts', ['definitely/not/results.json']);

    expect(result.code, 'missing results should be a usage error, not a verdict').toBe(2);
    expect(result.stderr).toContain('No test results');
  });

  // Regression: the gate once rendered a confident verdict from hours-old results,
  // because --reporter=line on the CLI replaces the configured JSON reporter.
  test('should refuse results older than the source it is judging', async () => {
    const dir = await tempDir();
    const stale = await resultsFile(
      dir,
      { expected: 10, unexpected: 0, flaky: 0, skipped: 0 },
      '2001-01-01T00:00:00.000Z',
    );

    const result = await cli('gate.ts', [stale]);

    expect(result.code, 'a verdict on changed code is not a verdict').toBe(2);
    expect(result.stderr).toContain('stale');
    await rm(dir, { recursive: true, force: true });
  });

  test('should write a verdict file for a fresh clean run', async () => {
    const dir = await tempDir();
    const fresh = await resultsFile(dir, { expected: 12, unexpected: 0, flaky: 0, skipped: 0 });
    // Own output path: two gate runs sharing artifacts/verdict.json is shared
    // mutable state, and it made this test flaky under parallel workers.
    const out = join(dir, 'verdict.json');

    const result = await cli('gate.ts', [fresh, out]);

    expect(result.code).toBe(0);
    const verdict = JSON.parse(await readFile(out, 'utf8')) as { verdict: string };
    expect(['PASS', 'CONDITIONAL']).toContain(verdict.verdict);
    await rm(dir, { recursive: true, force: true });
  });

  test('should FAIL and exit 1 when tests failed', async () => {
    const dir = await tempDir();
    const failed = await resultsFile(dir, { expected: 8, unexpected: 2, flaky: 0, skipped: 0 });

    const result = await cli('gate.ts', [failed, join(dir, 'verdict.json')]);

    expect(result.code, 'failing tests did not produce a non-zero exit — CI would go green').toBe(
      1,
    );
    expect(result.stdout).toContain('FAIL');
    await rm(dir, { recursive: true, force: true });
  });
});

test.describe('assert-quality CLI', () => {
  test('should pass over the repo’s own specs', async () => {
    const result = await cli('assert-quality.ts', ['apps', 'tests']);

    expect(result.code, `quality gate failed:\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('0 finding(s)');
  });

  test('should fail on a spec that asserts nothing', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'nested'), { recursive: true });
    await writeFile(
      join(dir, 'nested', 'vacuous.spec.ts'),
      "import { test } from '@playwright/test';\n" +
        "test('proves nothing', async ({ page }) => {\n  await page.goto('/');\n});\n",
      'utf8',
    );

    const result = await cli('assert-quality.ts', [dir]);

    expect(result.code, 'a spec that asserts nothing was accepted by the gate').toBe(1);
    expect(result.stdout).toContain('no-assertion');
    await rm(dir, { recursive: true, force: true });
  });
});

test.describe('assertion-floor CLI', () => {
  const IMPORT = "const assert = require('node:assert/strict');";

  test('should pass a subject test that asserts on what the code returned', async () => {
    const dir = await tempDir();
    const file = join(dir, 'search.test.js');
    await writeFile(
      file,
      `${IMPORT}\ntest('finds the term', () => {\n  assert.equal(search('alpha').length, 1);\n});\n`,
      'utf8',
    );

    const result = await cli('assertion-floor.ts', ['--assertions', IMPORT, file]);

    expect(result.code, `the floor refused a real test:\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('0 finding(s)');
    expect(
      result.stdout,
      'a floor that says OK without saying what it did not read reads as a review',
    ).toContain('Not checked here');
    await rm(dir, { recursive: true, force: true });
  });

  test('should fail a subject test whose every assertion is inside a conditional', async () => {
    const dir = await tempDir();
    const file = join(dir, 'search.test.js');
    await writeFile(
      file,
      `${IMPORT}\ntest('finds the term', () => {\n  const results = search('alpha');\n  if (results.length > 0) {\n    assert.equal(results[0].id, 'a');\n  }\n});\n`,
      'utf8',
    );

    const result = await cli('assertion-floor.ts', ['--assertions', IMPORT, file]);

    expect(result.code, 'a test that asserts only when a branch is taken was accepted').toBe(1);
    expect(result.stdout).toContain('conditional-only');
    expect(result.stdout, 'the finding must say which test and why').toContain('finds the term');
    await rm(dir, { recursive: true, force: true });
  });

  test('should exit 2 rather than report a pass when nothing was checked', async () => {
    const dir = await tempDir();
    const file = join(dir, 'helpers.js');
    await writeFile(file, `${IMPORT}\nconst helper = (value) => value;\n`, 'utf8');

    const result = await cli('assertion-floor.ts', [file]);

    expect(
      result.code,
      'a file with nothing to read exited 0, which is the verification that cannot fail',
    ).toBe(2);
    expect(result.stdout).toContain('nothing was checked');
    await rm(dir, { recursive: true, force: true });
  });
});

/**
 * Both map commands are advisory — they exit 0 whatever they find — so what these
 * check is the flag handling and the two things a reader relies on: the classification
 * reaches the output, and a root with no source is refused rather than reported as an
 * empty map. A command nothing exercises is a command whose flags rot silently.
 */
const FIXTURE_SOURCE =
  'const helper = (x) => x * 2;\n' +
  'function add(a, b) {\n  return a + b;\n}\n' +
  'module.exports = { add, helper };\n';
const FIXTURE_TEST =
  "const assert = require('node:assert/strict');\n" +
  "const { add } = require('../lib/math');\n" +
  "test('adds', () => {\n  assert.equal(add(1, 2), 3);\n});\n";

async function sourceFixture(): Promise<string> {
  const dir = await tempDir();
  await mkdir(join(dir, 'lib'), { recursive: true });
  await mkdir(join(dir, 'test'), { recursive: true });
  await writeFile(join(dir, 'lib', 'math.js'), FIXTURE_SOURCE, 'utf8');
  await writeFile(join(dir, 'test', 'math.test.js'), FIXTURE_TEST, 'utf8');
  return dir;
}

test.describe('candidates CLI', () => {
  test('should classify a fixture’s exports and name the one no test uses', async () => {
    const dir = await sourceFixture();

    const result = await cli('candidates.ts', [join(dir, 'lib'), '--tests', join(dir, 'test')]);

    expect(result.code, `the map command refused its own fixture:\n${result.stderr}`).toBe(0);
    expect(result.stdout, 'the reader needs the classification, not just a list').toContain(
      'exported unit(s)',
    );
    expect(result.stdout, 'and which candidate nothing references yet').toContain('helper');
    await rm(dir, { recursive: true, force: true });
  });

  test('should refuse a root with no source rather than print an empty map', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'notes.txt'), 'nothing to map here\n', 'utf8');

    const result = await cli('candidates.ts', [dir]);

    expect(result.code, 'an empty map reads as "there is nothing to test"').toBe(2);
    await rm(dir, { recursive: true, force: true });
  });
});

test.describe('survey CLI', () => {
  test('should map a fixture’s source and write the map when asked', async () => {
    const dir = await sourceFixture();
    const out = join(dir, 'map.json');

    const result = await cli('survey.ts', [
      join(dir, 'lib'),
      '--tests',
      join(dir, 'test'),
      '--save',
      out,
    ]);

    expect(result.code, `the survey refused its own fixture:\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('math.js');
    const map = JSON.parse(await readFile(out, 'utf8')) as {
      files: { path: string; units?: unknown[] }[];
    };
    expect(map.files.length, 'a saved map with no files is a map nothing can read').toBe(1);
    await rm(dir, { recursive: true, force: true });
  });

  test('should refuse a root with no source', async () => {
    const dir = await tempDir();

    const result = await cli('survey.ts', [dir]);

    expect(result.code, 'an empty map reads as "there is nothing here to survey"').toBe(2);
    expect(result.stderr).toContain('No source files found');
    await rm(dir, { recursive: true, force: true });
  });
});

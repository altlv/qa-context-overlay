import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { TSX_CLI } from '../../src/tool-paths.js';

const exec = promisify(execFile);
const REPO = resolve(process.cwd());

/**
 * What the comparator's exit code means — the part CI branches on.
 *
 * It used to exit 1 whenever any mutation survived. That reads as strict and is useless
 * as a gate step: no real suite kills every mutation, and the subject this was built for
 * leaves 10 of its 14 alive with a hand-written suite. A step that cannot go green is one
 * people learn to ignore, which is the same reasoning `external` carries in the app
 * contract.
 *
 * So the verdict now depends on what was asked. With `--against` the question is the one
 * the command exists for — did this change leave the suite weaker — and survivors are
 * information printed beside it. Without `--against` there is no before and after, so
 * completeness is the only claim available and a survivor is the finding.
 *
 * That change had no test. These fixtures are the smallest thing that can tell the two
 * verdicts apart: one rule, two mutations, and three suites of differing strength.
 */

/** Two rules, so a suite can catch one and miss the other. */
const SOURCE = `function classify(n) {
  if (n < 0) return 'negative';
  if (n === 0) return 'zero';
  return 'positive';
}
module.exports = { classify };
`;

const MUTATIONS = [
  {
    file: 'src/classify.js',
    find: "if (n < 0) return 'negative';",
    replace: "if (n < 1) return 'negative';",
    breaks: 'a negative number is classified by its sign',
  },
  {
    file: 'src/classify.js',
    find: "if (n === 0) return 'zero';",
    replace: "if (n === -1) return 'zero';",
    breaks: 'zero is its own class',
  },
];

const suite = (body: string): string => `const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/classify.js');
${body}`;

/** Kills both mutations. */
const STRONG = suite(`
test('negative', () => assert.equal(classify(-5), 'negative'));
test('zero', () => assert.equal(classify(0), 'zero'));
test('positive', () => assert.equal(classify(5), 'positive'));
`);

/** Kills the sign rule only — zero is never asked about. */
const WEAKER = suite(`
test('negative', () => assert.equal(classify(-5), 'negative'));
test('positive', () => assert.equal(classify(5), 'positive'));
`);

async function compare(repo: string, args: string[]): Promise<number> {
  try {
    await exec(
      process.execPath,
      [TSX_CLI, join(REPO, 'src', 'cli', 'mutation-compare.ts'), ...args],
      { cwd: repo, windowsHide: true, maxBuffer: 1 << 26 },
    );
    return 0;
  } catch (error) {
    const e = error as { code?: number | string };
    if (typeof e.code === 'string') {
      throw new Error(`could not spawn the comparator (${e.code}) — this test is broken`);
    }
    return e.code ?? 1;
  }
}

test.describe('what the comparator’s exit code claims', () => {
  test.describe.configure({ timeout: 180_000 });
  let repo = '';

  test.beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'mutation-verdict-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await mkdir(join(repo, 'test'), { recursive: true });
    await writeFile(join(repo, 'src', 'classify.js'), SOURCE, 'utf8');
    await writeFile(join(repo, 'test', 'strong.test.js'), STRONG, 'utf8');
    await writeFile(join(repo, 'test', 'weaker.test.js'), WEAKER, 'utf8');
    await writeFile(join(repo, 'mutations.json'), JSON.stringify(MUTATIONS), 'utf8');
  });

  test.afterAll(async () => {
    if (repo !== '') await rm(repo, { recursive: true, force: true });
  });

  test('should fail when a change leaves the suite weaker', async () => {
    // The whole point of the command. `weaker` misses the zero rule that `strong` catches.
    const code = await compare(repo, [
      '--mutations',
      'mutations.json',
      '--repo',
      '.',
      '--suite',
      'node',
      '--test',
      'test/strong.test.js',
      '--against',
      'node',
      '--test',
      'test/weaker.test.js',
    ]);
    expect(code, 'a mutation the first suite kills and the second does not must fail').toBe(1);
  });

  test('should pass a change that is no weaker, even with survivors', async () => {
    // The regression the exit-code fix could have introduced. `weaker` against itself
    // leaves a mutation alive and weakens nothing — a gate step that failed here would be
    // permanently red, which is the state that teaches people to ignore it.
    const code = await compare(repo, [
      '--mutations',
      'mutations.json',
      '--repo',
      '.',
      '--suite',
      'node',
      '--test',
      'test/weaker.test.js',
      '--against',
      'node',
      '--test',
      'test/weaker.test.js',
    ]);
    expect(code, 'survivors are information when nothing got weaker, not a failure').toBe(0);
  });

  test('should still fail a bare completeness check that leaves a survivor', async () => {
    // Without `--against` there is no before and after, so the only claim available is
    // completeness and a survivor is the finding. This half must not have been lost.
    const code = await compare(repo, [
      '--mutations',
      'mutations.json',
      '--repo',
      '.',
      '--suite',
      'node',
      '--test',
      'test/weaker.test.js',
    ]);
    expect(code).toBe(1);
  });

  test('should pass a bare check that kills everything', async () => {
    const code = await compare(repo, [
      '--mutations',
      'mutations.json',
      '--repo',
      '.',
      '--suite',
      'node',
      '--test',
      'test/strong.test.js',
    ]);
    expect(code).toBe(0);
  });
});

test.describe('a suite that passes only sometimes', () => {
  test.describe.configure({ timeout: 180_000 });
  let repo = '';

  /**
   * The third refusal. A red baseline is refused because it scores every mutation as caught, and
   * an unstartable one for the same reason — but a suite that passes *sometimes* was accepted,
   * and it is the worst of the three. A flaky test kills a mutation by chance, so the score
   * becomes noise with a mean while every number still prints with a straight face. The release
   * gate reports flakes it sees in a run; nothing on this path read that at all, which is where
   * it matters most, because every value claim this repository makes comes through here.
   *
   * The fixture flakes on a counter in a file rather than on timing, so the test is decided by
   * arithmetic and not by the machine it runs on: run one passes, run two fails.
   */
  const FLAKY = `const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { classify } = require('../src/classify.js');
const counter = require('node:path').join(__dirname, 'runs.txt');
test('passes the first time and not the second', () => {
  const runs = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;
  fs.writeFileSync(counter, String(runs), 'utf8');
  assert.equal(runs % 2, 1, 'this test fails on every even run, on purpose');
});
test('and does assert something real as well', () => assert.equal(classify(5), 'positive'));
`;

  test.beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'mutation-unstable-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await mkdir(join(repo, 'test'), { recursive: true });
    await writeFile(join(repo, 'src', 'classify.js'), SOURCE, 'utf8');
    await writeFile(join(repo, 'test', 'flaky.test.js'), FLAKY, 'utf8');
    await writeFile(join(repo, 'mutations.json'), JSON.stringify(MUTATIONS), 'utf8');
  });

  test.afterAll(async () => {
    if (repo !== '') await rm(repo, { recursive: true, force: true });
  });

  test('should be refused rather than scored', async () => {
    const code = await compare(repo, [
      '--mutations',
      'mutations.json',
      '--repo',
      '.',
      '--suite',
      'node',
      '--test',
      'test/flaky.test.js',
    ]);
    expect(
      code,
      'refused with 2, the code the comparator already uses for "I will not report a number"',
    ).toBe(2);
  });
});

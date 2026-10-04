import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { TSX_CLI } from '../../src/tool-paths.js';
import { git } from './throwaway-repo.js';

/**
 * The half of `bug-replay` that cannot be unit tested: git.
 *
 * Reversing one commit's source changes while keeping the tests at HEAD, restoring afterwards, and
 * refusing to run at all when the checkout is not clean — none of that can be exercised without a
 * real repository with a real history, and all of it writes into somebody else's checkout when it
 * runs for real. The first live run against `mcpa` left a subject's working tree holding a deleted
 * file and an untracked one, and the run before that reported `restored and verified clean` over a
 * `coursera-rag` checkout with a merge conflict in it. Both are pinned below.
 *
 * Every repository here is a throwaway in `tmpdir`. Nothing in this file may point at this
 * repository or at a subject's checkout.
 */

const exec = promisify(execFile);

/**
 * The CLI as a person runs it: a real process, real arguments, a real exit code. Node against
 * tsx's entry point rather than the `npx` shim, because on Windows a .cmd shim through execFile
 * without a shell fails with EINVAL — the same reasoning as .
 */
interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(...args: string[]): Promise<Ran> {
  try {
    const { stdout, stderr } = await exec(
      process.execPath,
      [TSX_CLI, join('src', 'cli', 'bug-replay.ts'), ...args],
      {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
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

/**
 * A subject with a real bug, a real fix, and a test that may or may not catch the fix going away.
 *
 * `defended` decides whether the committed test asserts the fixed behaviour or merely the happy
 * path. That is the whole question the instrument asks, so both answers have to be constructible
 * or the test proves only that the machinery runs.
 */
async function subjectWithAFix(options: { defended: boolean }): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'replay-subject-'));
  await git(repo, 'init', '--quiet');
  await git(repo, 'config', 'user.email', 'harness@example.invalid');
  await git(repo, 'config', 'user.name', 'harness test');
  await git(repo, 'config', 'core.autocrlf', 'false');

  // The product, with the bug in it: a discount that does not clamp at zero.
  await writeFile(
    join(repo, 'price.js'),
    'function discount(price, off) {\n  return price - off;\n}\nmodule.exports = { discount };\n',
  );
  await writeFile(
    join(repo, 'price.test.js'),
    [
      "const assert = require('node:assert/strict');",
      "const { test } = require('node:test');",
      "const { discount } = require('./price.js');",
      '',
      "test('takes the discount off', () => {",
      '  assert.equal(discount(100, 10), 90);',
      '});',
      '',
    ].join('\n'),
  );
  await git(repo, 'add', '.');
  await git(repo, 'commit', '--quiet', '-m', 'feat: pricing');

  // The fix, with or without a test that pins it.
  await writeFile(
    join(repo, 'price.js'),
    'function discount(price, off) {\n  return Math.max(0, price - off);\n}\nmodule.exports = { discount };\n',
  );
  const pins = options.defended
    ? ["test('never goes below zero', () => {", '  assert.equal(discount(10, 99), 0);', '});', '']
    : [
        "test('still takes the discount off', () => {",
        '  assert.equal(discount(100, 20), 80);',
        '});',
        '',
      ];
  await writeFile(
    join(repo, 'price.test.js'),
    [
      "const assert = require('node:assert/strict');",
      "const { test } = require('node:test');",
      "const { discount } = require('./price.js');",
      '',
      "test('takes the discount off', () => {",
      '  assert.equal(discount(100, 10), 90);',
      '});',
      '',
      ...pins,
    ].join('\n'),
  );
  await git(repo, 'add', '.');
  await git(repo, 'commit', '--quiet', '-m', 'fix: a discount could make a price negative');
  return repo;
}

test.describe('replaying a real fix', () => {
  test('should report a fix the tests at HEAD still catch', async () => {
    const repo = await subjectWithAFix({ defended: true });
    try {
      const result = await run('--repo', repo, '--suite', 'node', '--test', 'price.test.js');

      expect(
        result.stdout,
        'the clamp is reverted, the test that pins it is kept, and it fails — which is the suite doing its job',
      ).toContain('1/1 real changes defended');
      expect(
        result.stdout,
        'and the claim the whole instrument rests on must be stated where the number is',
      ).toContain('authored by the subject, not by this repository');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  test('should report a fix nothing notices, which is the finding', async () => {
    /**
     * Instrument liveness, and the only assertion here that matters. A replay that always said
     * `defended` would pass the test above and be worthless — the same shape as a mutation set
     * whose every entry is caught because nothing was ever applied.
     */
    const repo = await subjectWithAFix({ defended: false });
    try {
      const result = await run('--repo', repo, '--suite', 'node', '--test', 'price.test.js');

      expect(
        result.stdout,
        'the fix is undone and the suite stays green: the defect can come back in silence',
      ).toContain('nothing at HEAD notices being undone');
      expect(result.stdout, 'named, so it can be acted on').toContain(
        'fix: a discount could make a price negative',
      );
      expect(result.stdout, 'with the file whose revert went unnoticed').toContain('price.js');
      expect(result.code, 'an undefended real fault is the one thing worth failing on').toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  test('should keep the test file at HEAD rather than reverting it with the source', async () => {
    // The split the whole design turns on. A fix commit carries its own regression test, so
    // reverting the commit whole would remove the one test most likely to catch it — and every
    // replay would report `undefended` for a reason that has nothing to do with the suite.
    const repo = await subjectWithAFix({ defended: true });
    try {
      const result = await run('--repo', repo, '--suite', 'node', '--test', 'price.test.js');

      expect(result.stderr, 'the product is reverted').toContain('reverting: price.js');
      expect(result.stderr, 'and the test is not').toContain('keeping at HEAD: price.test.js');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  test('should leave the checkout exactly as it found it', async () => {
    /**
     * Pinned because it has already gone wrong twice in live runs, each time differently: once a
     * commit that had *deleted* a file was reversed, which recreated it, and `git checkout --`
     * cannot remove a path git does not track; once a conflicted three-way apply left its partial
     * work behind because the failure path returned before restoring.
     *
     * A reverted source left on disk reads exactly like a suite that caught the fault, so this is
     * the assertion that keeps every other number here honest.
     */
    const repo = await subjectWithAFix({ defended: true });
    try {
      await run('--repo', repo, '--suite', 'node', '--test', 'price.test.js');
      const status = await git(repo, 'status', '--porcelain');

      expect(status.stdout.trim(), 'nothing modified, nothing staged, nothing left untracked').toBe(
        '',
      );
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

test.describe('when it must refuse', () => {
  test('should refuse a checkout with uncommitted work in it', async () => {
    // The restore discards whatever is on the reverted paths, so a dirty checkout means
    // destroying somebody's work to take a measurement. It also makes the untracked-file cleanup
    // safe: on a clean tree, an untracked file on a reverted path was written by this process.
    const repo = await subjectWithAFix({ defended: true });
    try {
      await writeFile(join(repo, 'price.js'), '// work in progress\n');
      const result = await run('--repo', repo, '--suite', 'node', '--test', 'price.test.js');

      expect(result.stderr, 'it says what is in the way').toContain('uncommitted changes');
      expect(result.stderr, 'and why that outranks the measurement').toContain('not a trade this');
      expect(result.code).toBe(2);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  test('should refuse a suite that is already red', async () => {
    // A red suite reports every revert as caught, so the run would be a generator of reassurance.
    const repo = await subjectWithAFix({ defended: true });
    try {
      await writeFile(
        join(repo, 'broken.test.js'),
        [
          "const { test } = require('node:test');",
          "test('red', () => { throw new Error('x'); });",
          '',
        ].join('\n'),
      );
      await git(repo, 'add', '.');
      await git(repo, 'commit', '--quiet', '-m', 'test: a failing test');

      const result = await run('--repo', repo, '--suite', 'node', '--test', 'broken.test.js');

      expect(
        result.stderr,
        'it must say the suite was red before anything was touched, not merely that it failed',
      ).toContain('before anything was reverted');
      expect(result.code, 'and refuse rather than report a run of perfect catches').toBe(2);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  test('should refuse a directory that is not a git checkout', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'replay-plain-'));
    try {
      const result = await run('--repo', plain, '--suite', 'node', '--version');

      expect(
        result.stderr,
        'the instrument is the history; without one there is nothing to do',
      ).toContain('no history to replay');
      expect(result.code).toBe(2);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

test.describe('listing candidates', () => {
  test('should rank the declared fix and run no suite at all', async () => {
    const repo = await subjectWithAFix({ defended: true });
    try {
      const result = await run('--repo', repo, '--candidates');

      expect(result.stdout).toContain('its author called it a fix');
      expect(
        result.stdout,
        'and what it would do, so a misclassification is visible first',
      ).toContain('would revert: price.js');
      expect(
        result.stdout,
        'the ranking must not be mistaken for a judgement about what a commit was',
      ).toContain('signals, not a classification');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

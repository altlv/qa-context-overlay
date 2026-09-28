import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { TSX_CLI } from '../../src/tool-paths.js';
import { POISONS } from '../../src/qe/gate-poison.js';

const exec = promisify(execFile);
const REPO = resolve(process.cwd());

/**
 * Every gate check, handed something it is supposed to reject.
 *
 * The gate decides whether anything else here is worth believing, and nothing was
 * checking the checkers. Two costs in one week: `mutation-compare` exited 1 on any
 * survivor, which would have made it permanently red and therefore ignorable; and
 * `assertion floor: PASS` was read as "these tests are worth something" when it means
 * three mechanical things.
 *
 * A check that passes its own poison is not a verification, whatever it prints. These
 * run the real CLI as a real process and assert on the **exit code**, because CI branches
 * on that and a check that prints an error while exiting 0 is a check that silently
 * passes.
 */

async function run(script: string, args: string[]): Promise<number> {
  try {
    // node against tsx's entry point rather than the npx shim: on Windows a .cmd shim
    // through execFile without a shell fails with EINVAL, and a shell would mean
    // concatenating arguments instead of escaping them.
    await exec(process.execPath, [TSX_CLI, join('src', 'cli', script), ...args], {
      cwd: REPO,
      windowsHide: true,
    });
    return 0;
  } catch (error) {
    const e = error as { code?: number | string };
    if (typeof e.code === 'string') {
      throw new Error(`could not spawn ${script} (${e.code}) — this test is broken, not the gate`);
    }
    return e.code ?? 1;
  }
}

/** Which CLI carries each check, as the gate builds it. */
const CLI_FOR: Record<string, (file: string) => { script: string; args: string[] }> = {
  'assertion floor': (file) => ({
    script: 'assertion-floor.ts',
    args: ['--assertions', "const assert = require('node:assert/strict');", file],
  }),
  report: (file) => ({ script: 'check-report.ts', args: [file] }),
};

test.describe('every gate check can fail', () => {
  let dir = '';

  test.beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gate-poison-'));
  });

  test.afterAll(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true });
  });

  for (const poison of POISONS) {
    test(`${poison.check} should reject: ${poison.file}`, async () => {
      const path = join(dir, poison.file);
      await writeFile(path, poison.contents, 'utf8');

      const { script, args } = CLI_FOR[poison.check]!(path);
      const code = await run(script, args);

      expect(
        code,
        `"${poison.check}" passed a file it exists to reject — ${poison.because}. ` +
          'A check that passes its own poison is not a verification, whatever it prints.',
      ).not.toBe(0);
    });
  }

  test('should name a CLI for every poison, so none is silently unchecked', () => {
    // A poison with no runner would sit in the list looking like coverage. That is the
    // same failure shape the poisons exist to catch, one level up.
    for (const poison of POISONS) {
      expect(CLI_FOR[poison.check], `no CLI wired for "${poison.check}"`).toBeDefined();
    }
  });
});

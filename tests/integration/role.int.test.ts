import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { lockPathFor } from '../../src/qe/run-lock.js';
import { runsRoot } from '../../src/qe/run-worktree.js';
import { TSX_CLI } from '../../src/tool-paths.js';
import { DESIGN, ONE_CASE, designReport, throwawayRepo } from './throwaway-repo.js';

/**
 * The runner's refusals, exercised as a process in a throwaway repository.
 *
 * Every call passes `--preflight`. The SDK falls back to a Claude Code login when no key
 * is set, so a refusal that failed to fire would otherwise start a paid agent run. With
 * the flag it ends in exit 0 instead, and the test fails for free.
 */

const exec = promisify(execFile);
const ROLE_CLI = resolve(process.cwd(), 'src', 'cli', 'role.ts');

interface Run {
  code: number;
  stderr: string;
}

async function role(repo: string, args: string[]): Promise<Run> {
  try {
    const { stderr } = await exec(process.execPath, [TSX_CLI, ROLE_CLI, ...args, '--preflight'], {
      cwd: repo,
      windowsHide: true,
      timeout: 60_000,
    });
    return { code: 0, stderr };
  } catch (error) {
    const e = error as { code?: number | string; stderr?: string };
    if (typeof e.code !== 'number') {
      throw new Error(`role CLI did not exit normally: ${String(e.code)}`);
    }
    return { code: e.code, stderr: e.stderr ?? '' };
  }
}

const READY = [
  'e2e-coder',
  'implement the add cases',
  '--app',
  'todo-fixture',
  '--env',
  'local',
  '--design',
  DESIGN,
];

/** Refused runs exit 2 — distinct from a failed gate (1) and from a crash. */
const REFUSED = 2;

test.describe('the role runner, before it spends anything', () => {
  let parent = '';
  let repo = '';

  test.beforeEach(async () => {
    ({ parent, repo } = await throwawayRepo());
  });

  test.afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });

  test('should pass preflight when ready, and create no worktree and leave no lock', async () => {
    const run = await role(repo, READY);
    expect(run.code, `a ready run must not be refused:\n${run.stderr}`).toBe(0);
    expect(run.stderr).toContain('Preflight: "e2e-coder" is ready against todo-fixture/local');
    expect(existsSync(runsRoot(repo)), 'preflight must not create a worktree').toBe(false);
    expect(
      existsSync(join(repo, lockPathFor('todo-fixture', 'local'))),
      'the lock is released when the runner exits',
    ).toBe(false);
  });

  test('should refuse a role that does not exist', async () => {
    const run = await role(repo, ['e2e-codr', 'a task']);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(run.stderr, 'a typo in a role name must be named, not guessed at').toContain(
      'Unknown role "e2e-codr"',
    );
  });

  test('should refuse a coder with no target and no design, naming both', async () => {
    const run = await role(repo, ['e2e-coder', 'write some tests']);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(run.stderr, 'a coder with nowhere to point would invent a target').toContain(
      'no target',
    );
    expect(run.stderr, 'a coder with no design would invent one while it writes code').toContain(
      'no design',
    );
  });

  test('should refuse a design that is not committed', async () => {
    const draft = 'apps/todo-fixture/designs/draft.md';
    // Valid in every way but one: it exists only in the checkout, not at the base commit.
    writeFileSync(join(repo, draft), designReport(ONE_CASE));
    const run = await role(repo, [...READY.slice(0, -1), draft]);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(
      run.stderr,
      'the worktree is checked out at the base commit, so an uncommitted design would be silently absent',
    ).toContain(`design ${draft} is not committed`);
  });

  test('should refuse when the lockfile differs from the base commit', async () => {
    writeFileSync(join(repo, 'package-lock.json'), '{\n  "lockfileVersion": 4\n}\n');
    const run = await role(repo, READY);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(
      run.stderr,
      'linked modules installed from another lockfile would test code against the wrong dependencies',
    ).toContain('differs from the base commit');
  });

  test('should refuse a target another live run holds', async () => {
    const lock = join(repo, lockPathFor('todo-fixture', 'local'));
    mkdirSync(join(repo, 'artifacts', 'locks'), { recursive: true });
    // The test runner itself is the live holder.
    const held = { pid: process.pid, role: 'api-coder', startedAt: '2026-09-14T00:00:00.000Z' };
    writeFileSync(lock, JSON.stringify(held));
    const run = await role(repo, READY);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(run.stderr, 'two runs writing to one deployment meet each other’s data').toContain(
      `is in use by api-coder (pid ${process.pid}`,
    );
    expect(existsSync(lock), 'a refused run must not release a lock it does not hold').toBe(true);
  });

  test('should replace a lock left by a run that died', async () => {
    const lock = join(repo, lockPathFor('todo-fixture', 'local'));
    mkdirSync(join(repo, 'artifacts', 'locks'), { recursive: true });
    writeFileSync(lock, JSON.stringify({ pid: 2_147_483_000, role: 'api-coder', startedAt: 'x' }));
    const run = await role(repo, READY);
    expect(run.code, `a crashed run must not block every later one:\n${run.stderr}`).toBe(0);
    expect(run.stderr, 'replacing someone’s lock must be said out loud').toContain(
      'Replaced a lock left by a run that is no longer alive',
    );
  });

  test('should refuse a coding role pointed at another run’s worktree', async () => {
    const run = await role(repo, ['unit-coder', 'test src/qe/run-lock.ts', '--worktree', parent]);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(run.stderr, 'a role that can edit would change the evidence it was sent to').toContain(
      'Only a testing role may run in another run',
    );
  });

  test('should refuse an investigator pointed at a path that is not a run worktree', async () => {
    const run = await role(repo, [
      'failure-investigator',
      'reproduce artifacts/run/gate.json',
      '--worktree',
      join(parent, 'elsewhere'),
    ]);
    expect(run.code, run.stderr).toBe(REFUSED);
    expect(
      run.stderr,
      'an investigator in the wrong folder would investigate specs that never failed',
    ).toContain('is not one of');
    // The wording stopped being "this repository's" when a run's worktree became a worktree of
    // the *subject*: the refusal now names the repository it checked, which is the fact a person
    // needs when the subject is not this repository. Pinned to the contract, not the sentence.
    expect(run.stderr, 'the refusal must name what it checked the path against').toContain(
      'run worktrees',
    );
  });
});

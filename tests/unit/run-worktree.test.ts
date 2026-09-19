import { test, expect } from '@playwright/test';
import { join, resolve } from 'node:path';
import {
  canonical,
  insideDir,
  lockfilesMatch,
  runsRoot,
  worktreePath,
} from '../../src/qe/run-worktree.js';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * The pure half of worktree isolation: where runs live, what counts as inside one, and
 * when linked modules can be trusted. The git half is tested against a throwaway
 * repository in tests/integration/run-worktree.int.test.ts.
 */

const repo = resolve('/work/qa-context-overlay');

test.describe('where run worktrees live', () => {
  test('should put runs beside the repository, never inside it', () => {
    const root = runsRoot(repo);
    expect(
      insideDir(root, repo),
      'a worktree inside the repo is seen by its lint, format, tests and git status',
    ).toBe(false);
    expect(root).toBe(resolve('/work/qa-context-overlay-runs'));
    expect(worktreePath(repo, 'e2e-coder-1')).toBe(join(root, 'e2e-coder-1'));
  });
});

test.describe('what counts as inside a worktree', () => {
  const worktree = resolve('/work/qa-context-overlay-runs/e2e-coder-1');

  test('should accept a path inside it, relative or absolute', () => {
    expect(insideDir('apps/todo-fixture/tests/a.spec.ts', worktree)).toBe(true);
    expect(insideDir(join(worktree, 'src', 'x.ts'), worktree)).toBe(true);
    expect(insideDir(worktree, worktree)).toBe(true);
  });

  test('should refuse a path that climbs or points out of it', () => {
    expect(
      insideDir('../../qa-context-overlay/src/cli/role.ts', worktree),
      'an edit to the main checkout from inside a run is the shared state this removes',
    ).toBe(false);
    expect(insideDir(join(repo, 'src', 'cli', 'role.ts'), worktree)).toBe(false);
    expect(
      insideDir(resolve('/work/qa-context-overlay-runs/e2e-coder-10/x.ts'), worktree),
      'a sibling run with a similar name is not inside this one',
    ).toBe(false);
  });
});

test.describe('whether linked modules can be trusted', () => {
  test('should match lockfiles that differ only in line endings', () => {
    expect(lockfilesMatch('{\r\n  "a": 1\r\n}\r\n', '{\n  "a": 1\n}\n')).toBe(true);
  });

  test('should refuse a changed or missing lockfile', () => {
    expect(
      lockfilesMatch('{"a": 1}', '{"a": 2}'),
      'modules installed for one lockfile do not serve code from another',
    ).toBe(false);
    expect(lockfilesMatch(null, '{}')).toBe(false);
  });
});

test.describe('naming the same directory two ways', () => {
  test('should agree however the path was spelled', () => {
    // The regression: `git worktree list --porcelain` reports the long Windows path
    // while Node reports whatever it was handed, and `isRunWorktree` compared the two
    // strings and refused a worktree it had just created. On a machine with 8.3 short
    // names these two spellings differ; everywhere else they are already equal and
    // this asserts the invariant trivially. Both are worth having: the one that can
    // fail does so exactly where the bug lives.
    const short = tmpdir();
    const long = realpathSync.native(short);

    expect(
      canonical(short),
      'two spellings of one directory must canonicalise to one string, or a path comparison refuses a directory that exists',
    ).toBe(canonical(long));
  });

  test('should be idempotent, so a canonical path survives being canonicalised again', () => {
    const once = canonical(tmpdir());

    expect(canonical(once), 'a normaliser that moves on the second pass is not one').toBe(once);
  });

  test('should fall back rather than throw on a path that does not exist', () => {
    // isRunWorktree is handed whatever a caller passed to --worktree, which may be
    // nonsense. Throwing there would turn a wrong flag into a crash instead of a refusal.
    const missing = join(tmpdir(), 'no-such-directory-4e8f21');

    expect(
      canonical(missing),
      'a path that cannot be resolved must still come back absolute, so the caller can compare and refuse it',
    ).toBe(resolve(missing));
  });
});

import { test, expect } from '@playwright/test';
import { join, resolve } from 'node:path';
import { fileToolGuard } from '../../src/qe/file-guard.js';

/**
 * A worktree isolates a run only while the run stays in it. Both directions for each
 * tool: the path that leaves, and the ordinary path inside that must still work.
 */

const worktree = resolve('/work/qa-context-overlay-runs/e2e-coder-1');
const main = resolve('/work/qa-context-overlay');
const guard = fileToolGuard(worktree);

const allowed = (tool: string, input: Record<string, unknown>) => guard.check(tool, input)?.allowed;

test.describe('file tools inside a run worktree', () => {
  test('should allow reading and editing inside the worktree', () => {
    expect(allowed('Edit', { file_path: join(worktree, 'apps', 'x', 'tests', 'a.spec.ts') })).toBe(
      true,
    );
    expect(allowed('Write', { file_path: 'apps/x/tests/new.spec.ts' })).toBe(true);
    expect(allowed('Grep', { pattern: 'x' }), 'no path means the worktree itself').toBe(true);
  });

  test('should refuse writing to the main checkout', () => {
    expect(
      allowed('Edit', { file_path: join(main, 'src', 'cli', 'role.ts') }),
      'an edit to the main checkout reaches a person’s uncommitted work',
    ).toBe(false);
    expect(allowed('Write', { file_path: '../../qa-context-overlay/README.md' })).toBe(false);
    expect(allowed('NotebookEdit', { notebook_path: join(main, 'n.ipynb') })).toBe(false);
  });

  test('should refuse reading outside the worktree too', () => {
    expect(
      allowed('Read', { file_path: join(main, 'apps', 'x', 'draft.md') }),
      'what a run reads from outside its base commit is shared state leaking in',
    ).toBe(false);
    expect(allowed('Glob', { path: main, pattern: '**/*.ts' })).toBe(false);
  });

  test('should refuse .env anywhere, but not the example', () => {
    expect(allowed('Read', { file_path: join(worktree, '.env') })).toBe(false);
    expect(allowed('Read', { file_path: join(worktree, '.env.local') })).toBe(false);
    expect(allowed('Read', { file_path: join(worktree, '.env.example') })).toBe(true);
  });

  test('should leave tools that are not file tools to the other guards', () => {
    expect(
      guard.check('Bash', { command: 'cat ../x' }),
      'Bash belongs to the shell guard',
    ).toBeNull();
  });
});

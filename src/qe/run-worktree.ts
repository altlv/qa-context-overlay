import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { dirtyPaths } from './run-gate.js';

/**
 * A role run in its own git worktree.
 *
 * Every run used to work inside the one shared checkout, and every guarantee about what
 * it changed had to be patched in afterwards: a lock, a before-and-after comparison of
 * modification times, separate result and output folders — and a nested test run still
 * deleted another run's traces. All of those were symptoms of one broken principle: a
 * run's effects must be separable from everything else. A worktree makes that true by
 * construction. Its diff from the base commit is the run's work, whatever tool made it,
 * and nobody else's edits can be mixed in.
 *
 * What it costs, and is said out loud: a run tests committed code only; the worktree
 * shares the main checkout's `node_modules` through a link, so the lockfile must match;
 * and the agent's shell can still `cd` out of it. The file tools cannot — the guard
 * confines them.
 */

const exec = promisify(execFile);

/**
 * Where run worktrees live: a sibling of the repository, never inside it, so the
 * repository's own lint, format, test discovery and `git status` never see them.
 */
export function runsRoot(repoRoot: string): string {
  return join(dirname(resolve(repoRoot)), `${basename(resolve(repoRoot))}-runs`);
}

export function worktreePath(repoRoot: string, runId: string): string {
  return join(runsRoot(repoRoot), runId);
}

/** Whether `path` — absolute, or relative to `dir` — resolves inside `dir`. */
export function insideDir(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(dir, path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The path as the filesystem itself spells it, for comparing against git's output.
 *
 * `path.resolve` normalises separators and `..` and stops there, which is not enough
 * the moment two sources disagree about how to *name* the same directory. On Windows
 * a folder whose name contains a space gets an 8.3 alias, and a `TMP` pointing at
 * `C:\Users\PCUSER~1\...` is the short form of `C:\Users\PC User\...`.
 * `git worktree list --porcelain` reports the long form, Node reports whatever it was
 * given, and `isRunWorktree` compared the two strings and said no — refusing a
 * worktree it had created seconds earlier. `--worktree` reuse was therefore broken
 * for anyone whose path reaches the repository through a short name, which is why
 * this is not only a test fix.
 *
 * Falls back to `resolve` when the path does not exist, because `realpath` throws
 * there and a path that does not exist is not a worktree either way.
 *
 * **Deliberately not used by `insideDir`.** That one guards the file tools, and a run
 * worktree reaches `node_modules` through a link: resolving real paths there would
 * land outside the worktree and start refusing reads the run is entitled to.
 * Containment and identity are different questions and want different answers.
 */
export function canonical(path: string): string {
  try {
    return realpathSync.native(resolve(path));
  } catch {
    return resolve(path);
  }
}

/** Line endings differ between checkouts on Windows; content is what must match. */
export function lockfilesMatch(checkout: string | null, base: string | null): boolean {
  if (checkout === null || base === null) return false;
  const normalise = (text: string): string => text.replace(/\r\n/g, '\n').trimEnd();
  return normalise(checkout) === normalise(base);
}

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repo, ...args], {
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function headCommit(repoRoot: string): Promise<string> {
  return (await git(repoRoot, ['rev-parse', 'HEAD'])).trim();
}

/** Whether a path exists in a commit — a design must be committed to reach a worktree. */
export async function committedAt(
  repoRoot: string,
  commit: string,
  path: string,
): Promise<boolean> {
  try {
    await git(repoRoot, ['cat-file', '-e', `${commit}:${path.replace(/\\/g, '/')}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * A reason linked modules cannot be trusted, or null. The worktree links the main
 * checkout's `node_modules`, which was installed from the main checkout's lockfile; if
 * that differs from the base commit's, the run would test code against the wrong
 * dependencies.
 */
export async function lockfileProblem(repoRoot: string, base: string): Promise<string | null> {
  let checkout: string | null = null;
  let atBase: string | null = null;
  try {
    checkout = readFileSync(join(repoRoot, 'package-lock.json'), 'utf8');
  } catch {
    checkout = null;
  }
  try {
    atBase = await git(repoRoot, ['show', `${base}:package-lock.json`]);
  } catch {
    atBase = null;
  }
  if (checkout === null || atBase === null) {
    return 'package-lock.json is missing from the checkout or the base commit, so linked modules cannot be shown to match';
  }
  return lockfilesMatch(checkout, atBase)
    ? null
    : 'package-lock.json in the checkout differs from the base commit — the linked node_modules would not match the code the run tests. Commit or revert the lockfile change first';
}

/**
 * Makes the checkout's `node_modules` visible to every run worktree by linking it
 * **beside** them, in the runs folder — never inside a worktree.
 *
 * The first version put the link inside each worktree. A plain `git worktree remove`
 * — the command the runner told a person to run — followed that link and deleted the
 * main checkout's `node_modules`. Reproduced on 2026-09-14 in a throwaway repository
 * before anything was committed. Beside the worktrees, removing one cannot reach it,
 * and Node, `npm run` and `npx` all find modules by walking up to the parent folder —
 * verified the same day against the real checkout.
 */
export function linkModulesBesideRuns(repoRoot: string): void {
  const modules = join(resolve(repoRoot), 'node_modules');
  const link = join(runsRoot(repoRoot), 'node_modules');
  if (!existsSync(modules) || existsSync(link)) return;
  mkdirSync(runsRoot(repoRoot), { recursive: true });
  // A junction needs no elevation on Windows and is an ordinary symlink elsewhere.
  symlinkSync(modules, link, 'junction');
}

/** Creates the run's worktree at `base`, detached. Its modules resolve from the runs folder. */
export async function createRunWorktree(
  repoRoot: string,
  runId: string,
  base: string,
): Promise<string> {
  const path = worktreePath(repoRoot, runId);
  linkModulesBesideRuns(repoRoot);
  await git(repoRoot, ['worktree', 'add', '--detach', path, base]);
  return path;
}

/** Whether `path` is a registered worktree under this repository's runs folder. */
export async function isRunWorktree(repoRoot: string, path: string): Promise<boolean> {
  // Both sides through `canonical`, because this compares a caller's spelling of a
  // path against git's, and the two disagree whenever a short name is involved.
  const wanted = canonical(path);
  if (!insideDir(wanted, canonical(runsRoot(repoRoot)))) return false;
  const listing = await git(repoRoot, ['worktree', 'list', '--porcelain']);
  const registered = listing
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => canonical(line.slice('worktree '.length)));
  return registered.includes(wanted);
}

/** Everything changed in a run worktree — all of it the run's, by construction. */
export async function worktreeChanges(path: string): Promise<string[]> {
  return dirtyPaths(await git(path, ['status', '--porcelain', '-uall']));
}

/** A port nothing is listening on, for a server the harness starts itself. */
export async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolvePort(port));
    });
  });
}

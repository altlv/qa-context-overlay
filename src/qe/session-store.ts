import { appendFile, cp, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Where a session's evidence lives after its worktree is gone.
 *
 * A run's report, its progress notes, its screenshots and its gate record were all
 * written inside the run worktree — which is exactly the thing a person is told to
 * delete once they have taken what they want from it. So the evidence for every
 * session lived in the one directory whose purpose is to be removed, and several
 * sessions' notes and screenshots were destroyed that way before anyone noticed. The
 * report survived only when `--out` happened to point somewhere else.
 *
 * Evidence that only exists in a place you are instructed to delete is not kept.
 * A session's output is the product of the run; the worktree is scaffolding.
 *
 * `sessions/` is gitignored, like `artifacts/` and `reports/`. This is a place for a
 * person to look, not a place for the repository to carry.
 */

/** One run's folder, stable and sortable: `sessions/<app>/<role>-<stamp>`. */
export function sessionHome(app: string | null, role: string, stamp: string): string {
  // A run with no target still produced evidence, and burying it under a made-up app
  // name would make it unfindable. `no-target` says what happened.
  return join('sessions', app ?? 'no-target', `${role}-${stamp}`)
    .split('\\')
    .join('/');
}

export interface Harvested {
  /** Where the evidence went, relative to the repository root. */
  home: string;
  /** What was copied, for the run log. */
  copied: string[];
  /** Named things that were expected and absent — silence about a gap reads as a pass. */
  missing: string[];
}

/** A file or directory to carry out of the worktree, and what to call it at home. */
export interface Keepsake {
  /** Path inside the worktree. */
  from: string;
  /** Name inside the session home. */
  as: string;
  /** Whether its absence is worth reporting. A run may legitimately take no screenshots. */
  expected: boolean;
}

/**
 * What a run is worth keeping, in the order a person reads it.
 *
 * `runDir` varies: an investigation reusing another run's worktree writes beside it
 * rather than over it, so the caller passes the directory it actually used.
 */
export function keepsakes(runDir: string): Keepsake[] {
  return [
    { from: join(runDir, 'report.md'), as: 'report.md', expected: true },
    { from: join(runDir, 'summary.md'), as: 'summary.md', expected: false },
    { from: join(runDir, 'session-notes.md'), as: 'session-notes.md', expected: false },
    { from: join(runDir, 'gate.json'), as: 'gate.json', expected: true },
    { from: join(runDir, 'shots'), as: 'shots', expected: false },
    { from: join('artifacts', 'browser'), as: 'browser', expected: false },
  ];
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies a run's evidence out of its worktree, so removing the worktree costs nothing.
 *
 * Copies rather than moves: the worktree is still the run's own record until a person
 * has finished with it, and a harvest that emptied it would change the thing being
 * reviewed. Never throws — a failed copy loses one file and must not fail a run whose
 * work is already done.
 */
export async function harvestSession(options: {
  repoRoot: string;
  worktree: string;
  runDir: string;
  app: string | null;
  role: string;
  stamp: string;
  /** Loose files from elsewhere, e.g. a report `--out` put outside the worktree. */
  alsoCopy?: Keepsake[];
}): Promise<Harvested> {
  const home = sessionHome(options.app, options.role, options.stamp);
  const target = join(options.repoRoot, home);
  await mkdir(target, { recursive: true });

  const copied: string[] = [];
  const missing: string[] = [];

  for (const item of [...keepsakes(options.runDir), ...(options.alsoCopy ?? [])]) {
    const source = join(options.worktree, item.from);
    if (!(await exists(source))) {
      if (item.expected) missing.push(item.as);
      continue;
    }
    try {
      await cp(source, join(target, item.as), { recursive: true });
      copied.push(item.as);
    } catch {
      missing.push(`${item.as} (copy failed)`);
    }
  }

  // Loose screenshots a role wrote at the top of its worktree rather than under the
  // run directory. Two live runs did exactly that, and the files were lost with the
  // worktree — the gate had listed them as "files changed" and nothing kept them.
  try {
    const loose = (await readdir(options.worktree, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|log)$/i.test(entry.name))
      .map((entry) => entry.name);
    if (loose.length > 0) {
      await mkdir(join(target, 'shots'), { recursive: true });
      for (const name of loose) {
        await cp(join(options.worktree, name), join(target, 'shots', name));
        copied.push(`shots/${name}`);
      }
    }
  } catch {
    // A worktree we cannot list has nothing loose to rescue. Not worth failing over.
  }

  return { home, copied, missing };
}

/**
 * One line per session, so the question "what have we run, and how did it go" has an
 * answer that does not require opening anything.
 */
export function indexLine(input: {
  stamp: string;
  role: string;
  app: string | null;
  environment: string | null;
  defects: number | null;
  gate: 'PASS' | 'FAIL';
  costUsd: number;
  home: string;
}): string {
  const where = input.app === null ? 'no target' : `${input.app}/${input.environment ?? 'unknown'}`;
  const found = input.defects === null ? 'no report' : `${input.defects} defect(s)`;
  return `- ${input.stamp} · ${input.role} · ${where} · ${found} · gate ${input.gate} · $${input.costUsd.toFixed(4)} · [${input.home}](${input.home}/report.md)`;
}

/** Appends an index line. Never throws — losing a line must not fail a run. */
export async function noteInIndex(repoRoot: string, line: string): Promise<void> {
  try {
    await mkdir(join(repoRoot, 'sessions'), { recursive: true });
    await appendFile(join(repoRoot, 'sessions', 'INDEX.md'), `${line}\n`, 'utf8');
  } catch {
    // A convenience, not evidence. The session's own folder is the record.
  }
}

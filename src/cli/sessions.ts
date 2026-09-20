import '../env.js';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { parseReport } from '../qe/report.js';
import { findReport } from '../qe/run-report.js';
import { harvestSession, sessionHome } from '../qe/session-store.js';

/**
 * Lists sessions, and rescues any whose evidence is still trapped in a worktree.
 *
 * `npm run role` harvests on its way out, including when it is interrupted or throws.
 * This is for the runs that ended before that existed, and for the case it cannot
 * cover: a process killed outright, where no handler runs at all. A person about to
 * remove a run worktree should be able to ask "have I got everything out of these?"
 * and get an answer rather than a guess.
 *
 *   npm run sessions              list what has been kept
 *   npm run sessions -- rescue    copy out anything still only in a worktree
 */

const exec = promisify(execFile);
const repoRoot = process.cwd();
const [, , command = 'list'] = process.argv;

/** Every run worktree git knows about. Parsed porcelain, because paths contain spaces. */
async function runWorktrees(): Promise<string[]> {
  const { stdout } = await exec('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], {
    windowsHide: true,
  });
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((path) => path.includes('-runs'));
}

/**
 * Splits `exploratory-tester-2026-09-20T17-21-03-563Z` into its role and its stamp.
 *
 * The stamp is everything from the first date-looking segment, because role names
 * contain hyphens and so does the stamp — anything simpler mis-splits every role whose
 * name has two words, which is most of them.
 */
function splitRunName(folder: string): { role: string; stamp: string } {
  const at = folder.search(/\d{4}-\d{2}-\d{2}T/);
  if (at <= 0) return { role: folder, stamp: 'unknown' };
  return { role: folder.slice(0, at - 1), stamp: folder.slice(at) };
}

function defectsIn(path: string): number | null {
  try {
    const parsed = parseReport(readFileSync(path, 'utf8'));
    if (!parsed.ok) return null;
    return parsed.report.findings.filter((finding) =>
      ['blocker', 'major', 'minor'].includes(finding.severity),
    ).length;
  } catch {
    return null;
  }
}

async function list(): Promise<void> {
  const root = join(repoRoot, 'sessions');
  if (!existsSync(root)) {
    console.log('No sessions kept yet. They appear here once a run finishes or is stopped.');
    return;
  }

  let total = 0;
  for (const app of (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory())) {
    const runs = (await readdir(join(root, app.name), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    console.log(`\n${app.name}  (${runs.length})`);
    for (const run of runs) {
      const home = join(root, app.name, run);
      const defects = existsSync(join(home, 'report.md'))
        ? defectsIn(join(home, 'report.md'))
        : null;
      const has = ['report.md', 'session-notes.md', 'gate.json', 'shots'].filter((file) =>
        existsSync(join(home, file)),
      );
      console.log(
        `  ${run}\n    ${defects === null ? 'no readable report' : `${defects} defect(s)`} · ${has.join(', ') || 'nothing kept'}`,
      );
      total += 1;
    }
  }
  console.log(`\n${total} session(s) in sessions/. Nothing here is tracked by git.`);
}

async function rescue(): Promise<void> {
  const worktrees = await runWorktrees();
  if (worktrees.length === 0) {
    console.log('No run worktrees exist, so nothing is trapped in one.');
    return;
  }

  let rescued = 0;
  for (const worktree of worktrees) {
    const folder = basename(worktree);
    const { role, stamp } = splitRunName(folder);
    // The app is not in the folder name, so read it back from the gate record the run
    // wrote. A run that never reached its gate lands under `no-target`, which is
    // honest: we do not know what it was pointed at.
    let app: string | null = null;
    for (const dir of ['artifacts/run', 'artifacts']) {
      const record = join(worktree, dir, 'gate.json');
      if (existsSync(record)) {
        try {
          app = (JSON.parse(readFileSync(record, 'utf8')) as { app?: string | null }).app ?? null;
        } catch {
          app = null;
        }
        break;
      }
    }

    const home = join(repoRoot, sessionHome(app, role, stamp));
    if (existsSync(home)) {
      console.log(`already kept: ${folder}`);
      continue;
    }

    const kept = await harvestSession({
      repoRoot,
      worktree,
      runDir: 'artifacts/run',
      app,
      role,
      stamp,
    });
    // A report filed under reports/ predates the convention and is still the report.
    const found = findReport(worktree);
    const note = found === null ? '' : ` (report from ${found.relative})`;
    console.log(
      `rescued ${folder} -> ${kept.home}${note}\n  kept: ${kept.copied.join(', ') || 'nothing found'}`,
    );
    rescued += 1;
  }

  console.log(
    rescued === 0
      ? '\nNothing needed rescuing — every worktree already has a session folder.'
      : `\n${rescued} session(s) rescued. The worktrees are untouched; remove them when you are done.`,
  );
}

if (command === 'rescue') {
  await rescue();
} else if (command === 'list') {
  await list();
} else {
  console.error(`usage: npm run sessions [-- rescue]\n  unknown command "${command}"`);
  process.exit(2);
}

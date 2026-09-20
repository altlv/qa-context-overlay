import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseReport } from './report.js';

/**
 * Finds the report a run actually produced, rather than assuming its last message was
 * one.
 *
 * The runner used to write `result.text` — the agent's final chat message — to `--out`
 * and point the gate at that. Whether it passed then depended on a choice no role made
 * deliberately. Three of five live runs wrote their report to a file and signed off
 * with a summary, so the gate validated the summary: twice it failed for "no YAML
 * frontmatter", and once, worse, the summary opened with a *partial* frontmatter block,
 * so the parser accepted it as a report and failed it for missing `findings` and
 * `not_covered`. Every one of those reports was clean when checked at its real path.
 *
 * A gate whose verdict turns on where a role happened to put its prose is not a gate.
 * So: look for a file that parses as a report, and only fall back to the final message
 * when there is none.
 */

export interface FoundReport {
  /** Absolute path to the file. */
  path: string;
  /** Path as a person would refer to it, relative to the worktree. */
  relative: string;
  /** Which rule matched, for the run log — a person should see why this file won. */
  because: string;
}

/**
 * Where a report may live, in the order a run is asked to prefer.
 *
 * `artifacts/run` first because that is where the runner already puts a run's own
 * output, so a role following the convention lands there. `reports/` second because it
 * is what `npm run check-report` scans by default with no argument, and roles have
 * reasonably read that as the place reports go.
 */
const SEARCH_DIRS = ['artifacts/run', 'reports'] as const;

/** The conventional name, checked before any directory is listed. */
const PREFERRED = 'artifacts/run/report.md';

function parsesAsReport(path: string): boolean {
  try {
    return parseReport(readFileSync(path, 'utf8')).ok;
  } catch {
    // Unreadable is not a report. A run must not fail on a file it cannot open.
    return false;
  }
}

function markdownIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function modifiedAt(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * The report this run wrote, or null when it wrote none.
 *
 * Within a directory the **newest** valid report wins, because a run that wrote more
 * than one wrote the later one last, and a reused worktree carries an earlier run's
 * reports beside its own.
 */
export function findReport(worktree: string): FoundReport | null {
  const preferred = join(worktree, PREFERRED);
  if (existsSync(preferred) && parsesAsReport(preferred)) {
    return {
      path: preferred,
      relative: PREFERRED,
      because: 'the conventional path',
    };
  }

  for (const dir of SEARCH_DIRS) {
    const candidates = markdownIn(join(worktree, dir))
      .filter(parsesAsReport)
      .sort((left, right) => modifiedAt(right) - modifiedAt(left));

    const found = candidates[0];
    if (found !== undefined) {
      return {
        path: found,
        relative: relative(worktree, found).split('\\').join('/'),
        because:
          candidates.length === 1
            ? `the only valid report under ${dir}/`
            : `the newest of ${candidates.length} valid reports under ${dir}/`,
      };
    }
  }

  return null;
}

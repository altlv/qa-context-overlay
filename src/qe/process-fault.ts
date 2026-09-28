/**
 * Proves a subject's own test would notice the process it spawns going wrong.
 *
 * `fault-check` proves an app spec notices its **server** failing, and it works by
 * corrupting responses through a fixture the app cooperates with. A subject we do not
 * own has no such hook: its integration test spawns the real entry point itself, waits
 * for it, and talks to it. Nothing here could say whether that test would notice if the
 * process never started, died, or exited without a word.
 *
 * That gap is this level's central claim rather than a side check. A green integration
 * suite is supposed to mean the wiring works; if it stays green while the application
 * refuses to boot, it meant nothing at all.
 *
 * So: break the entry point in a way that is about the **process** rather than about any
 * rule it implements, run the suite, and require it to fail. A mutation asks "would you
 * notice this rule being wrong". A process fault asks "would you notice there being no
 * application", which is a different and more embarrassing question to get wrong.
 *
 * **Coarse on purpose, like `fault-check`.** Each fault is a line placed at the very top
 * of the entry point, so nothing needs to be understood about the subject's code — only
 * that the file is what gets executed. A fault that a suite survives is reported by name.
 */

export interface ProcessFault {
  /** What went wrong, as a person would say it. */
  name: string;
  /** Placed at the top of the entry point, before anything it does. */
  prelude: string;
  /** What a surviving suite has proven about itself. */
  because: string;
}

/**
 * The four ways a spawned process fails that a test can plausibly miss.
 *
 * Ordered by how easy each is to miss, gentlest first. The silent-success one is last
 * because it is the worst: a test that waits for a port with a timeout, or that never
 * checks the child at all, can sail past a process that did nothing and exited happily —
 * and every assertion afterwards then runs against a server that is not there.
 */
export const PROCESS_FAULTS: ProcessFault[] = [
  {
    name: 'the process refuses to start, exiting 1',
    prelude: 'process.exit(1);',
    because:
      'the suite is green against an application that never ran, so it is asserting on something else entirely',
  },
  {
    name: 'the process throws before doing anything',
    prelude: "throw new Error('fault injected by the harness');",
    because:
      'an unhandled startup crash left the suite unable to tell, which is the crash users see',
  },
  {
    name: 'the process dies a moment after starting',
    prelude: 'setTimeout(() => process.exit(1), 150);',
    because:
      'a process that starts and then dies is the shape of a real outage, and the suite noticed only the starting',
  },
  {
    name: 'the process exits 0 without doing anything',
    prelude: 'process.exit(0);',
    because:
      'the worst one to miss: a clean exit reads as success, so the suite passed with no application behind it',
  },
];

/** The entry point with a fault placed above everything it does. */
export function applyProcessFault(source: string, fault: ProcessFault): string {
  // After a shebang, if there is one: a line before `#!` stops the file being executable
  // and the run would then fail for a reason that is ours rather than the fault's.
  if (source.startsWith('#!')) {
    const firstLine = source.indexOf('\n');
    const head = firstLine === -1 ? source : source.slice(0, firstLine + 1);
    const rest = firstLine === -1 ? '' : source.slice(firstLine + 1);
    return `${head}${fault.prelude}\n${rest}`;
  }
  return `${fault.prelude}\n${source}`;
}

export interface FaultOutcome extends ProcessFault {
  /** True when the suite failed, which is the result being asked for. */
  noticed: boolean;
}

export interface FaultSummary {
  noticed: number;
  total: number;
  /** The faults a green suite sailed past. Each is a reason to distrust it. */
  survived: FaultOutcome[];
}

export function summariseFaults(outcomes: FaultOutcome[]): FaultSummary {
  return {
    noticed: outcomes.filter((outcome) => outcome.noticed).length,
    total: outcomes.length,
    survived: outcomes.filter((outcome) => !outcome.noticed),
  };
}

/**
 * What the runner prints.
 *
 * A surviving fault is named with what its survival proves, because "3/4" tells nobody
 * which question the suite cannot answer.
 */
export function reportFaults(summary: FaultSummary): string[] {
  const lines = [`Process faults noticed: ${summary.noticed}/${summary.total}`];
  for (const fault of summary.survived) {
    lines.push(`  SURVIVED — ${fault.name}`);
    lines.push(`      ${fault.because}`);
  }
  if (summary.survived.length === 0 && summary.total > 0) {
    lines.push('  The suite fails whenever the process does, which is what it claims to check.');
  }
  return lines;
}

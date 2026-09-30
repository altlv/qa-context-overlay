import { spawn } from 'node:child_process';

/**
 * Running a command and telling **working** apart from **waiting**.
 *
 * A wall-clock timeout answers the wrong question. It asks how long something has taken,
 * when what matters is whether anything is still happening: a suite of four hundred tests
 * legitimately runs for twenty minutes, and a suite of four that waits for a server which
 * will never listen is finished after one second and simply does not know it. Cut on
 * duration and the first is killed for being big while the second is tolerated for being
 * quiet — exactly backwards.
 *
 * So the measure here is **silence**. A test runner narrates: it prints a line per test,
 * a summary, a failure. A process that is progressing produces output, and one that is
 * blocked produces none. Silence for long enough is not slowness, it is a wait for
 * something that is not coming, and it can be reported as that rather than as a mystery.
 *
 * This replaced a plain timeout after a real wedge. `subject-fault-check` injected
 * `process.exit(1)` into an app whose suite waits for it to listen; the suite hung, the
 * check hung with it, and because the restore lived in a `finally` the blocked loop never
 * reached, the subject's entry point sat broken on disk. The first fix was a timeout,
 * which stopped the bleeding and still reported "killed after twenty minutes" for
 * something that was already stuck after two seconds.
 *
 * **Stopping is graceful first.** A signal that cannot be handled leaves a test runner no
 * chance to close the servers it spawned or say what it had reached, and orphaned
 * listeners are the next run's port collision. So: terminate, wait, and only then kill —
 * and say which of the three it took, because a process that ignored a polite signal is a
 * different problem from one that honoured it.
 *
 * **On Windows that half does not work, and pretending otherwise would be worse than
 * saying so.** `kill('SIGTERM')` there is `TerminateProcess`: there is no signal to
 * handle, a child cannot decline it, and the escalation to SIGKILL never happens because
 * the first attempt already ended it. A Windows run therefore gets the abrupt stop whether
 * it deserved one or not, and a suite stopped that way may leave the servers it spawned
 * listening. The idle detection above is unaffected — only the courtesy is.
 */

export type Outcome =
  /** Exited zero. */
  | 'passed'
  /** Exited non-zero of its own accord — a decision, which is what a check wants. */
  | 'failed'
  /** Said nothing for long enough that it was waiting rather than working. */
  | 'idle'
  /** Ran past the absolute cap while still producing output. */
  | 'endless';

export interface PatienceResult {
  outcome: Outcome;
  /** Exit code, or null when it was stopped. */
  code: number | null;
  /** The last lines it said, both streams, in the order they arrived. */
  output: string[];
  /** Total milliseconds it ran. */
  elapsedMs: number;
  /** Milliseconds of silence when it was stopped, or since its last output. */
  silentForMs: number;
  /** How hard it had to be stopped. `none` means it ended on its own. */
  stoppedWith: 'none' | 'term' | 'kill';
}

export interface PatienceOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  /**
   * Silence that counts as waiting.
   *
   * Generous by default, because a suite may reasonably think between tests — compiling,
   * seeding a fixture, waiting on a port that will answer. The number that matters is the
   * one a stuck process cannot beat, not the one a working process must.
   */
  idleMs?: number;
  /** How long a polite signal is given before the rude one. */
  graceMs?: number;
  /**
   * An absolute backstop, for a process that prints forever without finishing — a retry
   * loop is not silent and would otherwise never be caught by idleness alone.
   */
  capMs?: number;
  /** Lines to keep. A tail, because the end is where a stuck process says what it wanted. */
  keepLines?: number;
}

const DEFAULTS = { idleMs: 90_000, graceMs: 5_000, capMs: 30 * 60_000, keepLines: 40 };

export function runWithPatience(
  command: string,
  args: readonly string[],
  options: PatienceOptions = {},
): Promise<PatienceResult> {
  const { idleMs, graceMs, capMs, keepLines } = { ...DEFAULTS, ...options };

  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      windowsHide: true,
    });

    const startedAt = Date.now();
    let lastOutputAt = startedAt;
    let stoppedWith: PatienceResult['stoppedWith'] = 'none';
    let verdict: Outcome | null = null;
    const lines: string[] = [];
    let partial = '';

    const keep = (chunk: Buffer): void => {
      lastOutputAt = Date.now();
      partial += chunk.toString();
      const split = partial.split(/\r?\n/);
      partial = split.pop() ?? '';
      for (const line of split) {
        lines.push(line);
        // Bounded as it goes rather than at the end: a process that prints for half an
        // hour must not be held in memory to be summarised in forty lines.
        if (lines.length > keepLines) lines.shift();
      }
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);

    // Escalation, kept in one place so "how hard did we have to push" is recorded rather
    // than inferred. A runner given SIGTERM usually closes its servers and prints what it
    // reached, and that output is the most useful thing in the log.
    const stop = (because: Outcome): void => {
      if (verdict !== null) return;
      verdict = because;
      stoppedWith = 'term';
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          stoppedWith = 'kill';
          child.kill('SIGKILL');
        }
      }, graceMs).unref();
    };

    const watch = setInterval(() => {
      if (Date.now() - lastOutputAt >= idleMs) stop('idle');
      else if (Date.now() - startedAt >= capMs) stop('endless');
    }, 1_000);
    watch.unref();

    const settle = (code: number | null): void => {
      clearInterval(watch);
      if (partial.trim() !== '') lines.push(partial);
      resolve({
        // A verdict set by `stop` wins: the exit code of a process we killed says how it
        // died, not what it decided, and reading it as a decision is how a wedge gets
        // filed as a failure.
        outcome: verdict ?? (code === 0 ? 'passed' : 'failed'),
        code,
        output: lines.slice(-keepLines),
        elapsedMs: Date.now() - startedAt,
        silentForMs: Date.now() - lastOutputAt,
        stoppedWith,
      });
    };

    child.on('close', settle);
    child.on('error', () => {
      // Could not be spawned at all. Not a decision and not a wait — the caller has to be
      // able to tell "your command is wrong" from "your suite is stuck".
      verdict = 'failed';
      settle(null);
    });
  });
}

/**
 * One line saying what happened and why it is worth knowing.
 *
 * A log that prints only a cross sends a person to look at the work when the finding is
 * about the check. These read differently on purpose.
 */
export function describePatience(name: string, result: PatienceResult): string {
  const secs = (ms: number): string => `${Math.round(ms / 1000)}s`;
  switch (result.outcome) {
    case 'passed':
      return `✓ ${name} (${secs(result.elapsedMs)})`;
    case 'failed':
      return `✗ ${name} — exited ${result.code ?? 'without a code'} after ${secs(result.elapsedMs)}`;
    case 'idle':
      return (
        `✗ ${name} — WAITING, not working: nothing printed for ${secs(result.silentForMs)} of` +
        ` ${secs(result.elapsedMs)}. Stopped with SIG${result.stoppedWith.toUpperCase()}.` +
        ' Something it expected never arrived; bound the wait rather than the run.'
      );
    case 'endless':
      return (
        `✗ ${name} — still going after ${secs(result.elapsedMs)} and still printing.` +
        ` Stopped with SIG${result.stoppedWith.toUpperCase()}. Busy is not the same as` +
        ' progressing: look for a retry that never gives up.'
      );
  }
}

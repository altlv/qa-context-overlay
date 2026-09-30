import { test, expect } from '@playwright/test';
import { describePatience, runWithPatience } from '../../src/qe/patience.js';

/**
 * Working against waiting.
 *
 * A wall-clock timeout asks how long something took, when the question is whether anything
 * is still happening. It killed a big suite for being big and tolerated a stuck one for
 * being quiet — and a real wedge proved it: a suite waiting for a server that would never
 * listen was finished after a second and did not know, while the timeout reported "killed
 * after twenty minutes" as though it had been busy.
 *
 * Each case here runs a real child process, because the thing being tested is what happens
 * to a process and nothing about that is worth faking.
 */

const node = (script: string, options = {}) =>
  runWithPatience(process.execPath, ['-e', script], { keepLines: 20, ...options });

test.describe.configure({ timeout: 60_000 });

test.describe('a process that decides for itself', () => {
  test('should read a zero exit as passed', async () => {
    const result = await node('console.log("done")');
    expect(result.outcome).toBe('passed');
    expect(result.stoppedWith, 'nothing needed stopping, so nothing should claim to').toBe('none');
    expect(result.output.join('\n')).toContain('done');
  });

  test('should read a non-zero exit as a decision, not a problem with the check', async () => {
    // This is what a check wants: the suite looked, disagreed, and said so.
    const result = await node('console.error("nope"); process.exit(3)');
    expect(
      result.outcome,
      'a suite that looked, disagreed and said so is the result a check wants — not a problem with the check',
    ).toBe('failed');
    expect(result.code).toBe(3);
    expect(result.output.join('\n')).toContain('nope');
  });

  test('should keep the tail from both streams, in arrival order', async () => {
    const result = await node(
      'console.log("first"); console.error("second"); console.log("third")',
    );
    expect(
      result.output.filter((line) => line !== '').slice(-3),
      'a stuck process says what it wanted in its last lines, and stderr is where it usually says it',
    ).toEqual(['first', 'second', 'third']);
  });
});

test.describe('a process that has stopped happening', () => {
  test('should call silence waiting, not slowness', async () => {
    // Prints once, then blocks forever — the shape of a suite waiting on a port.
    const result = await node(
      'console.log("listening for something"); setInterval(() => {}, 1000)',
      {
        idleMs: 1_500,
        graceMs: 500,
      },
    );
    expect(result.outcome, 'silence for long enough is a wait, and can be named as one').toBe(
      'idle',
    );
    expect(result.silentForMs).toBeGreaterThanOrEqual(1_400);
    expect(result.output.join('\n')).toContain('listening for something');
  });

  test('should not call a slow but talking process idle', async () => {
    // The case a wall clock gets wrong: legitimately long, and obviously alive.
    const result = await node(
      'let n = 0; const t = setInterval(() => { console.log("step " + ++n); if (n === 6) { clearInterval(t); } }, 300)',
      { idleMs: 1_500, graceMs: 500 },
    );
    expect(
      result.outcome,
      'a process narrating its progress is working, however long it takes',
    ).toBe('passed');
    expect(result.output.join('\n')).toContain('step 6');
  });

  test('should stop a talkative process that never finishes, by the cap', async () => {
    // Idleness alone cannot catch a retry loop: it is never silent. The cap is the only
    // thing that can, and it is deliberately separate so the log can say which applied.
    const result = await node('setInterval(() => console.log("retrying"), 100)', {
      idleMs: 30_000,
      capMs: 2_000,
      graceMs: 500,
    });
    expect(result.outcome, 'busy is not the same as progressing').toBe('endless');
  });
});

test.describe('how hard it had to be stopped', () => {
  test('should try a polite signal before a rude one', async () => {
    const result = await node('console.log("up"); setInterval(() => {}, 1000)', {
      idleMs: 1_000,
      graceMs: 3_000,
    });
    expect(
      result.stoppedWith,
      'a runner given SIGTERM closes its servers and says what it reached; orphaned listeners are the next run’s port collision',
    ).toBe('term');
  });

  test('should escalate when the polite signal is ignored, where signals can be ignored', async () => {
    const result = await node(
      'process.on("SIGTERM", () => {}); console.log("ignoring"); setInterval(() => {}, 1000)',
      { idleMs: 1_000, graceMs: 800 },
    );
    expect(result.outcome, 'silence is the measure whatever the platform does about signals').toBe(
      'idle',
    );

    // Platform, not preference. On Windows `kill('SIGTERM')` is TerminateProcess: there is
    // no signal to handle, so a process cannot ignore it and escalation never happens.
    // Which also means the graceful half of this — letting a runner close its servers and
    // say what it reached — is POSIX-only, and a Windows run gets the abrupt stop whether
    // it deserves it or not. Worth a failing expectation somewhere rather than a comment
    // nobody reads, so it is asserted per platform.
    expect(
      result.stoppedWith,
      process.platform === 'win32'
        ? 'on Windows SIGTERM terminates outright, so it never escalates — and graceful shutdown is unavailable here'
        : 'a process that ignores SIGTERM is a different problem, and worth recording as one',
    ).toBe(process.platform === 'win32' ? 'term' : 'kill');
  });

  test('should not read the exit code of something it killed as a decision', async () => {
    // A killed process exits non-zero. Reading that as "failed" is how a wedge gets filed
    // as a finding about the work.
    const result = await node('setInterval(() => {}, 1000)', { idleMs: 800, graceMs: 400 });
    expect(result.outcome).not.toBe('failed');
  });
});

test.describe('what the log says', () => {
  test('should distinguish a finding about the work from one about the check', () => {
    const base = {
      code: 1,
      output: [],
      elapsedMs: 5_000,
      silentForMs: 0,
      stoppedWith: 'none' as const,
    };
    const failed = describePatience('changed test passes', { ...base, outcome: 'failed' });
    const idle = describePatience('changed test passes', {
      ...base,
      outcome: 'idle',
      silentForMs: 90_000,
      elapsedMs: 95_000,
      stoppedWith: 'term',
    });
    expect(failed).toContain('exited 1');
    expect(idle, 'a cross alone sends a person to look at the work').toContain(
      'WAITING, not working',
    );
    expect(idle).toContain('bound the wait rather than the run');
  });

  test('should say a command that could not start is not a stuck one', async () => {
    const result = await runWithPatience('a-command-that-does-not-exist-here', []);
    expect(
      result.outcome,
      'the caller must tell "your command is wrong" from "your suite is stuck"',
    ).toBe('failed');
  });
});

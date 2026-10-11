import { test, expect } from '@playwright/test';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { join } from 'node:path';
import { stopHook } from '../../src/qe/stop-hook.js';
import { preferredReportPath } from '../../src/qe/run-report.js';

/**
 * The only thing in this harness that can stop a session finishing with nothing readable.
 *
 * Reporting is how a run most often produces nothing. Of the 29 reports kept to 2026-10-11, **19
 * parse, 3 are prose and 7 are empty files**, and the worst case cost a session seven findings
 * including three majors — written to a file with no frontmatter, of which only the closing summary
 * survived. Every earlier measure was advice: the role prompt asks for a report and
 * `report-skeleton` hands over the shape, and neither can stop a sign-off without one.
 *
 * `Stop` returns `decision: 'block'` with a reason the model reads, which makes this the first
 * enforcement rather than exhortation. The tests that matter are the three ways it must *not* fire,
 * because a hook that blocks wrongly is worse than one that never blocks: it argues with the
 * budget, or it loops.
 */

const signal = new AbortController().signal;

/**
 * The path the refusal has to name.
 *
 * A live probe on 2026-10-11 drove the shipped hook against a real agent. It blocked
 * correctly and the session then spent 12 turns to its turn limit writing nothing, because
 * the refusal said "write a report" without saying where. A refusal that cannot be acted on
 * is a budget leak rather than a guard.
 */
const REPORT_PATH = '/run/artifacts/run/report.md';

const stopping = (over: Partial<{ stop_hook_active: boolean }> = {}): HookInput =>
  ({
    hook_event_name: 'Stop',
    stop_hook_active: false,
    session_id: 's',
    transcript_path: 't',
    cwd: '.',
    ...over,
  }) as unknown as HookInput;

type Blocked = { decision?: string; reason?: string; continue?: boolean };

test.describe('holding a session open until it has written a report', () => {
  test('should block a sign-off with no readable report, and say what to do', async () => {
    const seen: string[] = [];
    const hook = stopHook(
      () => 'no report file was found under artifacts/run/ or reports/',
      REPORT_PATH,
      () => false,
      (problem) => seen.push(problem),
    );

    const out = (await hook.hooks[0]!(stopping(), 'id', { signal })) as Blocked;

    expect(out.decision, 'advice has already been tried; this is the part that refuses').toBe(
      'block',
    );
    expect(out.reason ?? '', 'the cause, so the session is not guessing').toContain(
      'no report file was found',
    );
    expect(out.reason ?? '', 'and the command that produces a valid one').toContain(
      'report-skeleton',
    );
    expect(seen, 'the operator sees it too, or a held session looks like a hung one').toEqual([
      'no report file was found under artifacts/run/ or reports/',
    ]);
  });

  test('should let a session finish once it has one', async () => {
    const hook = stopHook(
      () => null,
      REPORT_PATH,
      () => false,
    );

    const out = (await hook.hooks[0]!(stopping(), 'id', { signal })) as Blocked;

    expect(out.decision, 'nothing to say, nothing blocked').toBeUndefined();
    expect(out.continue).toBe(true);
  });

  test('should block once and never twice', async () => {
    /**
     * `stop_hook_active` is true when a stop has already been blocked. Ignoring it is how a hook
     * like this becomes a loop that spends the budget the report needs on repeating itself.
     */
    const hook = stopHook(
      () => 'still no report',
      REPORT_PATH,
      () => false,
    );

    const out = (await hook.hooks[0]!(stopping({ stop_hook_active: true }), 'id', {
      signal,
    })) as Blocked;

    expect(out.decision, 'told once is enough; the gate is where this lands next').toBeUndefined();
  });

  test('should never argue with the budget', async () => {
    /**
     * A truncated run did not choose to finish, so holding it open would be the harness fighting
     * its own ceiling — and item 48 is the precedent: a run cut short is a budget finding and must
     * not be reported as a formatting one.
     */
    const hook = stopHook(
      () => 'no report file was found',
      REPORT_PATH,
      () => true,
    );

    const out = (await hook.hooks[0]!(stopping(), 'id', { signal })) as Blocked;

    expect(out.decision, 'the budget ended this run, not the session').toBeUndefined();
  });

  test('should let the session close when its own check throws', async () => {
    // Fail-soft, like the observer: the gate still runs afterwards, and holding a finished session
    // hostage to our own bookkeeping is worse than letting it close.
    const hook = stopHook(
      () => {
        throw new Error('worktree vanished');
      },
      REPORT_PATH,
      () => false,
    );

    const out = (await hook.hooks[0]!(stopping(), 'id', { signal })) as Blocked;

    expect(
      out.decision,
      'a check that could not decide must not hold a finished session',
    ).toBeUndefined();
    expect(out.continue, 'and the gate still runs afterwards either way').toBe(true);
  });

  test('should ignore every event that is not a stop', async () => {
    const hook = stopHook(
      () => 'no report',
      REPORT_PATH,
      () => false,
    );

    const out = (await hook.hooks[0]!(
      { hook_event_name: 'PostToolUse' } as unknown as HookInput,
      'id',
      { signal },
    )) as Blocked;

    expect(out.decision).toBeUndefined();
  });
});

test.describe('the path the refusal names', () => {
  /**
   * Found by driving the shipped hook against a live agent on 2026-10-11, after a first probe with
   * a hand-written imitation of it had passed — the neighbouring claim, for the fifth time this
   * week. The real hook blocked correctly and the session then spent **12 turns to its turn
   * limit** writing nothing, at twice the cost of the probe whose refusal named an exact file.
   *
   * The agent retried because it had no target, not because it declined. A refusal that cannot be
   * acted on is not a guard, it is a budget leak.
   */

  test('should tell the session exactly where to write it', async () => {
    const hook = stopHook(
      () => 'no report file was found',
      '/run/artifacts/run/report.md',
      () => false,
    );

    const out = (await hook.hooks[0]!(stopping(), 'id', { signal })) as Blocked;

    expect(
      out.reason ?? '',
      'a session told to write a report without a path has nothing to act on',
    ).toContain('/run/artifacts/run/report.md');
    expect(out.reason ?? '', 'and it has to be unmistakably the path, not an example').toContain(
      'that exact path',
    );
  });

  test('should name the path that findReport actually reads', () => {
    /**
     * The coupling is the point. A refusal naming a path the check does not look at would be this
     * same defect wearing a precise-looking number, so the runner passes
     * `preferredReportPath(worktree)` — the function `findReport` and `unparsedReport` resolve
     * against — rather than assembling a path beside them.
     */
    expect(preferredReportPath('/run')).toBe(join('/run', 'artifacts', 'run', 'report.md'));
  });
});

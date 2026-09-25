import { test, expect } from '@playwright/test';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { clockHook, clockLine, type ClockReading } from '../../src/qe/session-clock.js';

/**
 * The clock exists because two measured sessions stopped at 13 minutes of a 45-minute
 * timebox on timestamps they invented, with 135 turns and 88 actions unspent and no
 * budget cutting them off. These tests pin the two properties that failure needs: the
 * reading is taken fresh on every batch, and it tells a session sitting on most of its
 * budget not to close.
 */

const base: ClockReading = {
  elapsedMs: 0,
  timeboxMs: 45 * 60 * 1000,
  turns: 0,
  maxTurns: 250,
  costUsd: 0,
};

const batch = (): HookInput =>
  ({ hook_event_name: 'PostToolBatch', tool_calls: [] }) as unknown as HookInput;

const signal = new AbortController().signal;

/** The union the SDK returns has no `hookSpecificOutput` on its async arm. */
const contextOf = (output: unknown): string =>
  String(
    (output as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput
      ?.additionalContext ?? '',
  );

test.describe('the session clock line', () => {
  test('should lead with what remains, because the failure is stopping early', () => {
    const line = clockLine({ ...base, elapsedMs: 13 * 60 * 1000, turns: 65, costUsd: 5.4382 });
    expect(line).toContain('32m00s of the timebox REMAINING');
    expect(line).toContain('13m00s elapsed');
    expect(line).toContain('Turns 65/250');
  });

  test('should forbid closing while most of the timebox remains', () => {
    // The exact state both measured sessions were in when they announced they were done.
    const line = clockLine({ ...base, elapsedMs: 13 * 60 * 1000 });
    expect(line).toContain('Do NOT close the session');
    expect(line).toContain('floor to spend, not a ceiling to avoid');
  });

  test('should switch to closing only in the last fifth', () => {
    const line = clockLine({ ...base, elapsedMs: 40 * 60 * 1000 });
    expect(line).toContain('Begin closing');
    expect(line).not.toContain('Do NOT close');
  });

  test('should say plainly when the timebox is spent, and never report negative time', () => {
    const line = clockLine({ ...base, elapsedMs: 60 * 60 * 1000 });
    expect(line).toContain('The timebox is spent');
    expect(line).toContain('0s of the timebox REMAINING');
  });

  test('should report spend with no limit beside it', () => {
    // Runs are measured, not capped. A reference printed next to the number invites
    // the session to treat the reference as a boundary.
    expect(clockLine({ ...base, costUsd: 5.4382 })).toContain('$5.44 — measured, not capped');
  });

  test('should carry the action count only when a browser supplied one', () => {
    expect(clockLine(base)).not.toContain('State-changing');
    expect(clockLine({ ...base, actions: 12, maxActions: 100 })).toContain(
      'State-changing actions 12/100',
    );
  });
});

test.describe('the clock hook', () => {
  test('should attach the reading to a resolved batch', async () => {
    const hook = clockHook(() => ({ ...base, elapsedMs: 60_000 }));
    expect(contextOf(await hook.hooks[0]!(batch(), 'id', { signal }))).toContain('SESSION CLOCK');
  });

  test('should say nothing on any other event', async () => {
    const hook = clockHook(() => base);
    const other = { hook_event_name: 'PreToolUse' } as unknown as HookInput;
    expect(await hook.hooks[0]!(other, 'id', { signal })).toEqual({ continue: true });
  });

  test('should be fail-soft, so a broken clock is never a tool error', async () => {
    // A session cannot tell our bookkeeping from the product misbehaving, and has
    // filed the difference as a defect before.
    const hook = clockHook(() => {
      throw new Error('no clock');
    });
    expect(await hook.hooks[0]!(batch(), 'id', { signal })).toEqual({ continue: true });
  });

  test('should re-read the clock on every batch', async () => {
    // A snapshot taken when the run was configured would hand every turn the same
    // numbers, which is precisely the bug this module removes.
    let elapsed = 0;
    const hook = clockHook(() => ({ ...base, elapsedMs: (elapsed += 60_000) }));
    expect(contextOf(await hook.hooks[0]!(batch(), 'id', { signal }))).toContain('1m00s elapsed');
    expect(contextOf(await hook.hooks[0]!(batch(), 'id', { signal }))).toContain('2m00s elapsed');
  });
});

import { test, expect } from '@playwright/test';
import {
  PROCESS_FAULTS,
  applyProcessFault,
  reportFaults,
  summariseFaults,
  type FaultOutcome,
} from '../../src/qe/process-fault.js';

/**
 * Does a subject's own test notice the process it spawns failing?
 *
 * `fault-check` answers that for an app spec and its server, through a fixture the app
 * cooperates with. A subject we do not own has no such hook — its integration test
 * spawns the real entry point itself — so nothing could say whether a green suite would
 * survive the application refusing to boot.
 *
 * Measured once these existed: both the agent's suite and the subject's hand-written one
 * notice all four, which is the answer being hoped for and not the one that was assumed.
 */

const fault = (name: string): FaultOutcome => ({
  name,
  prelude: 'process.exit(1);',
  because: 'the suite is green against an application that never ran',
  noticed: false,
});

test.describe('breaking the entry point', () => {
  test('should put the fault above everything the file does', () => {
    const broken = applyProcessFault("require('./app.js');\n", PROCESS_FAULTS[0]!);
    expect(
      broken.startsWith(PROCESS_FAULTS[0]!.prelude),
      'a fault placed after the work has already let the work happen',
    ).toBe(true);
  });

  test('should keep a shebang first', () => {
    // A line before `#!` stops the file being executable, and the run would then fail
    // for a reason that is ours rather than the fault's — which reads as "noticed".
    const broken = applyProcessFault('#!/usr/bin/env node\nconsole.log(1);\n', PROCESS_FAULTS[0]!);
    expect(broken.startsWith('#!/usr/bin/env node\n'), 'the shebang must stay line one').toBe(true);
    expect(broken.split('\n')[1]).toBe(PROCESS_FAULTS[0]!.prelude);
  });

  test('should cover the silent exit, which is the one worth missing least', () => {
    // A clean exit reads as success, so a suite that waits with a timeout or never checks
    // the child can pass with no application behind it.
    const silent = PROCESS_FAULTS.find((entry) => entry.prelude === 'process.exit(0);');
    expect(silent, 'a fault set without a zero-exit tests only the loud failures').toBeDefined();
  });

  test('should say what every fault proves when survived', () => {
    for (const entry of PROCESS_FAULTS) {
      expect(
        entry.because.length,
        `${entry.name} has no consequence written down, so a survivor reports a number and no meaning`,
      ).toBeGreaterThan(20);
    }
  });
});

test.describe('what the result says', () => {
  test('should name each survivor, because a score names no question', () => {
    const lines = reportFaults(
      summariseFaults([
        { ...fault('the process refuses to start'), noticed: true },
        fault('the process exits 0'),
      ]),
    ).join('\n');
    expect(lines).toContain('1/2');
    expect(lines, '"3 of 4" tells nobody which question the suite cannot answer').toContain(
      'SURVIVED — the process exits 0',
    );
  });

  test('should claim nothing extra when every fault was noticed', () => {
    const lines = reportFaults(
      summariseFaults([
        { ...fault('a'), noticed: true },
        { ...fault('b'), noticed: true },
      ]),
    ).join('\n');
    expect(lines).toContain('2/2');
    expect(lines, 'the claim is narrow: it fails when the process does, nothing more').toContain(
      'fails whenever the process does',
    );
  });
});

test.describe('a suite that hangs instead of deciding', () => {
  test('should report hanging apart from surviving, and lead with it', () => {
    // Folding the two together reports the worse outcome as the milder one. A suite that
    // fails has done its job; one that waits forever for a process that will never arrive
    // costs the whole run — in CI, a stuck build rather than a red one. Measured: the
    // models suite an agent wrote hangs on all four faults, because nothing bounds its
    // wait for the app to listen.
    const lines = reportFaults(
      summariseFaults([{ ...fault('the process refuses to start'), hung: true }]),
    ).join('\n');
    expect(lines, 'a hang must not be filed under the same word as a pass').toContain('HUNG —');
    expect(lines).toContain('stuck build rather than a red one');
  });

  test('should still call a plain survivor a survivor', () => {
    const lines = reportFaults(summariseFaults([fault('the process exits 0')])).join('\n');
    expect(lines).toContain('SURVIVED — the process exits 0');
    expect(lines, 'nothing hung here, so nothing should say so').not.toContain('HUNG');
  });
});

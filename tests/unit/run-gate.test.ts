import { test, expect } from '@playwright/test';
import {
  dirtyPaths,
  gatePassed,
  investigationCommand,
  planGate,
  type GateRecord,
} from '../../src/qe/run-gate.js';

/**
 * The post-run gate decides what the runner re-checks. Missing a step means a run's
 * claim stands unchecked; adding one that cannot apply means every run fails for a
 * reason nobody can act on.
 */

const REPORT = 'artifacts/run/report.md';
const RUN_DIR = 'artifacts/run';
const names = (plan: ReturnType<typeof planGate>) => plan.steps.map((step) => step.name);
const base = { report: REPORT, runDir: RUN_DIR, environment: null };

test.describe('the coding gate', () => {
  test('should check quality, run the specs and fault-check an app spec', () => {
    const plan = planGate({
      ...base,
      role: 'e2e-coder',
      family: 'coding',
      changed: ['apps\\todo-fixture\\tests\\add.ui.spec.ts', 'src/pages/base-page.ts'],
    });
    expect(
      names(plan),
      'each is a claim the agent makes about its own work, re-checked by the runner',
    ).toEqual(['assert-quality', 'changed specs pass', 'fault check', 'report']);
    expect(plan.steps[0]?.args.slice(-1)).toEqual(['apps/todo-fixture/tests/add.ui.spec.ts']);
  });

  test('should run the specs in the run’s environment, never the registry default', () => {
    const plan = planGate({
      ...base,
      role: 'api-coder',
      family: 'coding',
      environment: 'test',
      changed: ['apps/shop/tests/cart.api.spec.ts'],
    });
    const run = plan.steps.find((step) => step.name === 'changed specs pass');
    const fault = plan.steps.find((step) => step.name === 'fault check');
    expect(
      [run?.env.TEST_ENV, fault?.env.TEST_ENV],
      'the gate once ran every spec against the default environment, whatever the run named',
    ).toEqual(['test', 'test']);
  });

  test('should write the gate’s results into the run’s own folder', () => {
    const plan = planGate({
      ...base,
      role: 'e2e-coder',
      family: 'coding',
      changed: ['apps/todo-fixture/tests/add.ui.spec.ts'],
    });
    const run = plan.steps.find((step) => step.name === 'changed specs pass');
    expect(
      run?.env.HARNESS_RESULTS_FILE,
      'a gate writing artifacts/results.json would replace the suite results the release gate reads',
    ).toBe(`${RUN_DIR}/results.json`);
    expect(run?.args).toContain(`${RUN_DIR}/test-results`);
  });

  test('should not fault-check a harness test, and say so', () => {
    const plan = planGate({
      ...base,
      role: 'unit-coder',
      family: 'coding',
      changed: ['tests/unit/gate.test.ts'],
    });
    expect(names(plan)).not.toContain('fault check');
    expect(plan.notRun.join(' '), 'a skipped check must be stated').toContain('fault check');
  });

  test('should say when a coding run changed no spec', () => {
    const plan = planGate({ ...base, role: 'api-coder', family: 'coding', changed: [] });
    expect(names(plan)).toEqual(['report']);
    expect(
      plan.notRun.join(' '),
      'a coding run that wrote no spec must say so, not pass silently',
    ).toContain('no spec file changed');
  });

  test('should hold the testability reviewer to its report only', () => {
    const plan = planGate({
      ...base,
      role: 'testability-reviewer',
      family: 'coding',
      changed: ['apps/x/scans/page.json'],
    });
    expect(names(plan), 'a reviewer writes findings, not specs').toEqual(['report']);
  });
});

test.describe('the testing gate', () => {
  test('should check every design the planner wrote', () => {
    const plan = planGate({
      ...base,
      role: 'test-planner',
      family: 'testing',
      changed: ['apps/todo-fixture/designs/add.md'],
    });
    expect(names(plan)).toEqual(['design apps/todo-fixture/designs/add.md', 'report']);
  });

  test('should fail a planner run that produced no design', () => {
    const plan = planGate({ ...base, role: 'test-planner', family: 'testing', changed: [] });
    expect(
      plan.problems.join(' '),
      'a design that exists only in the chat reaches no coder',
    ).toContain('no design file');
  });

  test('should check a session’s notes rather than listing them as not run', () => {
    // Until E6 landed this asserted the opposite: the gate named the session format
    // under notRun and checked nothing a session cares about. The rules now live in
    // auditReport and fire on `report: exploratory-session`, so the same check-report
    // step every role runs enforces them — no extra step, one place the rules live.
    const plan = planGate({ ...base, role: 'exploratory-tester', family: 'testing', changed: [] });

    expect(
      plan.notRun.join(' '),
      'a gate that still announces the session format as unenforced is describing a hole that was filled',
    ).not.toContain('E6');
    expect(
      plan.steps.map((step) => step.name),
      'the report step is what carries the session rules, so a session with no report check is unchecked',
    ).toContain('report');
  });
});

test.describe('after a failed gate', () => {
  const record = (over: Partial<GateRecord> = {}): GateRecord => ({
    role: 'e2e-coder',
    app: 'todo-fixture',
    environment: 'local',
    report: REPORT,
    changed: ['apps/todo-fixture/tests/add.ui.spec.ts'],
    steps: [
      { name: 'assert-quality', passed: true, output: [] },
      { name: 'changed specs pass', passed: false, output: ['1 failed'] },
    ],
    problems: [],
    notRun: [],
    evidence: [`${RUN_DIR}/results.json`],
    ...over,
  });

  test('should hand the failure to an investigator that must prove the cause', () => {
    const command = investigationCommand(record(), `${RUN_DIR}\\gate.json`);
    expect(command, 'a failure is a finding to investigate, not something to override').toContain(
      'failure-investigator',
    );
    expect(command).toContain(`${RUN_DIR}/gate.json`);
    expect(command, 'the investigator reproduces where the run ran').toContain(
      '--app todo-fixture --env local',
    );
    expect(command, '"flaky" without a measured rate is a claim').toContain('measured rate');
  });

  test('should point the investigator at the failed run’s own worktree', () => {
    const command = investigationCommand(
      record(),
      `${RUN_DIR}/gate.json`,
      'C:\\work\\qa-context-overlay-runs\\e2e-coder-1',
    );
    expect(
      command,
      'the failing specs exist only in that worktree; a fresh one at HEAD would not have them',
    ).toContain('--worktree "C:/work/qa-context-overlay-runs/e2e-coder-1"');
  });

  test('should hand off nothing when the gate passed', () => {
    const passing = record({
      steps: [{ name: 'changed specs pass', passed: true, output: [] }],
    });
    expect(gatePassed(passing)).toBe(true);
    expect(investigationCommand(passing, `${RUN_DIR}/gate.json`)).toBeNull();
  });

  test('should hand off a harness-only failure without inventing a target', () => {
    const command = investigationCommand(
      record({ app: null, environment: null, problems: ['test-planner wrote no design file'] }),
      `${RUN_DIR}/gate.json`,
    );
    expect(command, 'a problem with no failed step is still a failed gate').not.toBeNull();
    expect(command).not.toContain('--app');
  });
});

test.describe('what a run changed', () => {
  test('should read paths out of git status, renames and quoting included', () => {
    expect(dirtyPaths(' M src/a.ts\n?? "apps/x/tests/b c.spec.ts"\nR  old.ts -> new.ts\n')).toEqual(
      ['src/a.ts', 'apps/x/tests/b c.spec.ts', 'new.ts'],
    );
  });
});

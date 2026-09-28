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

  const subjectStack = {
    runner: 'node --test',
    runAll: 'node --test test/*.test.js',
    runOne: 'node --test ',
    testsDir: 'test',
    testFilePattern: '*.test.js',
    moduleSystem: 'commonjs',
    assertions: "const assert = require('node:assert/strict');",
    exemplar: 'test/specIndexer.test.js',
  };

  test('should run a subject’s changed tests with the subject’s own runner', () => {
    const plan = planGate({
      ...base,
      role: 'unit-coder',
      family: 'coding',
      changed: ['test/searchIndex.unit.test.js', 'src/services/searchIndex.js'],
      testStack: subjectStack,
    });

    // The run's worktree is a worktree of the subject, so a path relative to it and the
    // subject's own runner are what apply. Before this, a run against any subject that does
    // not use Playwright was told there was nothing to check — which is every subject we do
    // not own, and the only kind this role is pointed at.
    expect(names(plan), 'the subject runner replaces the spec-shaped steps').toEqual([
      'changed test passes: test/searchIndex.unit.test.js',
      'assertion floor',
      'report',
    ]);
    expect(plan.steps[0]?.args, 'node --test over the changed file, in the worktree').toEqual([
      '--test',
      'test/searchIndex.unit.test.js',
    ]);
    // The runner proves the tests pass; the floor proves they assert something. `assert-quality`
    // reads Playwright specs, so a node:test file used to clear the gate having asserted nothing.
    const floor = plan.steps.find((step) => step.name === 'assertion floor');
    expect(
      floor?.args.slice(-3),
      'the stack’s own import line, then the file the floor judges',
    ).toEqual(['--assertions', subjectStack.assertions, 'test/searchIndex.unit.test.js']);
    expect(plan.notRun.join(' '), 'and nothing claims to have been skipped').not.toContain(
      'nothing for the coding gate to check',
    );
    expect(plan.steps[0]?.command, 'the runner the stack declared, not this process').toBe('node');
  });

  test('should run a subject that declares another runner with that runner', () => {
    // The step used to be built as ['--test', file] and executed as `node --test <file>`,
    // whatever the stack said. That is invisible while the only declared stack is
    // `node --test` — and silently wrong for the first subject declaring vitest, which
    // would either fail a run that did nothing wrong or pass without running anything.
    // TestStack collects runner, runAll and runOne so a runner is never assumed; the gate
    // assumed anyway.
    const plan = planGate({
      ...base,
      role: 'unit-coder',
      family: 'coding',
      changed: ['src/thing.spec.ts'],
      testStack: {
        ...subjectStack,
        runner: 'npx vitest run',
        runAll: 'npx vitest run',
        runOne: 'npx vitest run ',
        testFilePattern: '*.spec.ts',
        assertions: "import { expect } from 'vitest';",
      },
    });

    const step = plan.steps.find((entry) => entry.name.startsWith('changed test passes'));
    expect(step?.command, 'the declared binary, not node').toBe('npx');
    expect(step?.args, 'its own arguments, then the file').toEqual([
      'vitest',
      'run',
      'src/thing.spec.ts',
    ]);
  });

  test('should name what counts as a test when a subject run changed none', () => {
    const plan = planGate({
      ...base,
      role: 'unit-coder',
      family: 'coding',
      changed: ['src/services/searchIndex.js'],
      testStack: subjectStack,
    });
    expect(
      plan.notRun.join(' '),
      'a subject run that wrote no test must say so, and say what would have counted',
    ).toContain('*.test.js');
  });

  test('should run the harness’s own scripts from a checkout that has them', () => {
    const plan = planGate({
      ...base,
      role: 'unit-coder',
      family: 'coding',
      changed: ['test/searchIndex.unit.test.js'],
      testStack: subjectStack,
      harnessRoot: 'C:\\harness',
    });
    const report = plan.steps.find((step) => step.name === 'report');

    // A subject run's worktree is a worktree of the *subject*, which holds no `src/cli`.
    // Read relative to it, every script-shaped step died at ERR_MODULE_NOT_FOUND before the
    // agent's work was looked at, so the run was failed by the harness's own path —
    // reproduced from the subject worktree at mcpa-training-bot-runs/c8d7549 on 2026-09-24.
    expect(report?.args.slice(-2), 'the checker comes from the checkout that holds it').toEqual([
      'C:/harness/src/cli/check-report.ts',
      REPORT,
    ]);
    const floor = plan.steps.find((step) => step.name === 'assertion floor');
    expect(
      floor?.args[1],
      'every script-shaped step, including the newest, resolves where the script actually is',
    ).toBe('C:/harness/src/cli/assertion-floor.ts');
  });

  test('should keep the worktree’s own script for a run in this repository', () => {
    const plan = planGate({
      ...base,
      role: 'e2e-coder',
      family: 'coding',
      changed: ['apps/todo-fixture/tests/add.ui.spec.ts'],
    });
    const quality = plan.steps.find((step) => step.name === 'assert-quality');

    // Not absolute: a run that changed the checker must be judged by the version it changed.
    expect(quality?.args[1], 'a run is judged by the copy in its own worktree').toBe(
      'src/cli/assert-quality.ts',
    );
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

test.describe('whether the tests would notice a fault', () => {
  const stack = {
    runner: 'node --test',
    runAll: 'node --test test/*.test.js',
    runOne: 'node --test ',
    testsDir: 'test',
    testFilePattern: '*.test.js',
    moduleSystem: 'commonjs',
    assertions: "const assert = require('node:assert/strict');",
    exemplar: 'test/specIndexer.test.js',
  };

  test('should hold a changed suite against the subject’s own suite for that seam', () => {
    // The steps beside this say a test passes and that it asserts. Neither says it would
    // notice a fault, and the assertion floor names that blind spot itself: "a value the
    // test computed for itself is above this floor". Measured on mcpa — the hand-written
    // suite kills 4 of 14, the agent's file kills 8 and survives one the hand-written
    // suite catches. Twice as strong, and weaker in one place no other step can see.
    const plan = planGate({
      ...base,
      role: 'integration-coder',
      family: 'coding',
      changed: ['test/labs-integration.test.js'],
      testStack: stack,
      mutations: {
        set: 'apps/mcpa/mutations/labs-routes.ts',
        baseline: 'test/labs-routes.test.js',
      },
    });

    const step = plan.steps.find((entry) => entry.name.startsWith('mutation strength'));
    expect(step, 'a subject declaring a mutation set must be scored against it').toBeDefined();
    const args = step?.args.join(' ') ?? '';
    // The baseline is `--suite` and the new work is `--against`, because the rule is
    // survivors(new) ⊆ survivors(baseline) — held against what exists, not a number
    // somebody picked.
    expect(args).toContain('--suite node --test test/labs-routes.test.js');
    expect(args).toContain('--against node --test test/labs-integration.test.js');
  });

  test('should say nothing about fault-finding when the subject declares no set', () => {
    // Silence rather than a claim: without a set the gate knows a test passes and asserts,
    // and nothing more.
    const plan = planGate({
      ...base,
      role: 'integration-coder',
      family: 'coding',
      changed: ['test/labs-integration.test.js'],
      testStack: stack,
    });
    expect(plan.steps.map((s) => s.name).join(' ')).not.toContain('mutation strength');
  });
});

test.describe('whether the tests notice there being no application', () => {
  const stack = {
    runner: 'node --test',
    runAll: 'node --test test/*.test.js',
    runOne: 'node --test ',
    testsDir: 'test',
    testFilePattern: '*.test.js',
    moduleSystem: 'commonjs',
    assertions: "const assert = require('node:assert/strict');",
    exemplar: 'test/specIndexer.test.js',
  };

  test('should break the declared entry point and require the suite to fail', () => {
    // The mutation set asks whether a rule being wrong is caught. This asks the cruder
    // question underneath it — would a green suite survive the application refusing to
    // boot — and a suite failing that one was never testing the wiring at all.
    const plan = planGate({
      ...base,
      role: 'integration-coder',
      family: 'coding',
      changed: ['test/labs-integration.test.js'],
      testStack: stack,
      entryPoint: 'src/server.js',
    });

    const step = plan.steps.find((entry) => entry.name === 'tests notice the process failing');
    expect(step, 'a subject naming its entry point must have that question asked').toBeDefined();
    expect(step?.args.join(' ')).toContain('--entry src/server.js');
    expect(step?.args.join(' ')).toContain('--suite node --test test/labs-integration.test.js');
  });

  test('should ask nothing when the subject names no entry point', () => {
    // Silence rather than a guess: the gate cannot know what process a suite spawns.
    const plan = planGate({
      ...base,
      role: 'integration-coder',
      family: 'coding',
      changed: ['test/labs-integration.test.js'],
      testStack: stack,
    });
    expect(plan.steps.map((s) => s.name).join(' ')).not.toContain('process failing');
  });
});

import { test, expect } from '@playwright/test';
import {
  pathsNamedIn,
  readinessProblems,
  stalenessWarning,
  type DesignReading,
  type ReadinessContext,
  type RunRequest,
} from '../../src/qe/readiness.js';

/**
 * A run that is not ready must not start, and a run that is ready must not be refused.
 * Both directions per role, because a readiness check that refuses good runs gets
 * bypassed, and one that admits bad runs is the invented design all over again.
 */

const designs: Record<string, DesignReading> = {
  'apps/todo-fixture/designs/add.md': { kind: 'test-design', cases: 3 },
  'apps/todo-fixture/designs/empty.md': { kind: 'test-design', cases: 0 },
  'apps/todo-fixture/designs/bug.md': { kind: 'bug', cases: 0 },
  'apps/todo-fixture/designs/broken.md': { problems: ['No YAML frontmatter block found.'] },
};

const context: ReadinessContext = {
  exists: (path) =>
    path in designs || ['src/qe/gate.ts', 'artifacts/runs/e2e-coder-1/gate.json'].includes(path),
  readDesign: (path) => designs[path] ?? { problems: ['unreadable'] },
};

const problems = (request: RunRequest) => readinessProblems(request, context);

test.describe('a coder that implements a design', () => {
  const ready: RunRequest = {
    role: 'e2e-coder',
    task: 'implement the design',
    app: 'todo-fixture',
    environment: 'local',
    design: 'apps/todo-fixture/designs/add.md',
  };

  test('should start with a design that lists cases, an app and an environment', () => {
    expect(problems(ready), 'a ready run must not be refused').toEqual([]);
  });

  test('should refuse to start without a design', () => {
    expect(
      problems({ ...ready, design: undefined }).join(' '),
      'a coder with no design invents one while writing code',
    ).toContain('no design');
  });

  test('should refuse a design that is missing, invalid, the wrong kind or empty', () => {
    for (const [design, expected] of [
      ['apps/todo-fixture/designs/nope.md', 'does not exist'],
      ['apps/todo-fixture/designs/broken.md', 'not a valid report'],
      ['apps/todo-fixture/designs/bug.md', 'not a test design'],
      ['apps/todo-fixture/designs/empty.md', 'lists no cases'],
    ] as const) {
      expect(problems({ ...ready, design }).join(' '), design).toContain(expected);
    }
  });

  test('should refuse an api-coder with no environment, like an e2e-coder', () => {
    // Its specs reach a server as surely as a browser spec does; without --env the
    // gate ran them against whatever the registry's default happened to be.
    expect(
      problems({ ...ready, role: 'api-coder', environment: undefined }).join(' '),
      'an api-coder with no environment tests a deployment nobody chose',
    ).toContain('no target');
  });
});

test.describe('the other roles', () => {
  test('should require a unit or integration coder to name the module', () => {
    expect(
      problems({ role: 'unit-coder', task: 'test the gate' }).join(' '),
      'a unit coder given nothing named tests nothing in particular',
    ).toContain('nothing named');
    expect(
      problems({ role: 'unit-coder', task: 'test the rules in src/qe/gate.ts' }),
      'a named, existing module is enough to start — harness code needs no app',
    ).toEqual([]);
  });

  test('should require the planner to have something to cite', () => {
    expect(
      problems({ role: 'test-planner', task: 'design tests' }).join(' '),
      'a design with nothing behind it is a preference',
    ).toContain('no evidence');
    expect(problems({ role: 'test-planner', task: 'design tests', app: 'todo-fixture' })).toEqual(
      [],
    );
  });

  test('should require an exploratory session to carry a charter and a target', () => {
    const charter = 'Explore the cart\nTo discover totals that disagree\nTimebox 30 minutes';
    expect(
      problems({
        role: 'exploratory-tester',
        task: 'look around',
        app: 'shop',
        environment: 'test',
      }).join(' '),
      'a session with no charter is clicking around',
    ).toContain('no charter');
    expect(
      problems({ role: 'exploratory-tester', task: charter }).join(' '),
      'a session must know which deployment it is exploring',
    ).toContain('no target');
    expect(
      problems({ role: 'exploratory-tester', task: charter, app: 'shop', environment: 'test' }),
    ).toEqual([]);
  });

  test('should require the investigator to have a failure to reproduce, and nothing more', () => {
    expect(
      problems({ role: 'failure-investigator', task: 'why did it fail' }).join(' '),
      'a localisation needs the failing run’s evidence to start from',
    ).toContain('nothing to reproduce');
    expect(
      problems({
        role: 'failure-investigator',
        task: 'localise the failure recorded in artifacts/runs/e2e-coder-1/gate.json',
      }),
      'a harness-only failure has no app, and the gate record is enough to start',
    ).toEqual([]);
  });
});

test.describe('a design that may have gone stale', () => {
  const design = 'apps/todo-fixture/designs/add.md';

  test('should say nothing when the app has not changed since the design’s commit', () => {
    expect(stalenessWarning(design, 'abc1234', [])).toBeNull();
  });

  test('should warn, naming what changed, when the app has', () => {
    const warning = stalenessWarning(design, 'abc1234', [
      'apps/todo-fixture/app/server.mjs',
      'apps/todo-fixture/app/index.html',
    ]);
    expect(warning, 'a design can outlive the code it describes').toContain('server.mjs');
  });

  test('should say staleness is unknown rather than stay silent', () => {
    expect(
      stalenessWarning(design, undefined, null),
      'silence would read as "not stale"',
    ).toContain('records no commit');
    expect(stalenessWarning(design, 'deadbeef', null)).toContain('cannot compare');
  });
});

test.describe('reading paths out of a task', () => {
  test('should find repository paths and drop trailing punctuation', () => {
    expect(pathsNamedIn('see `src/qe/gate.ts`, and ./apps/x/tests/a.spec.ts.')).toEqual([
      'src/qe/gate.ts',
      'apps/x/tests/a.spec.ts',
    ]);
  });
});

test.describe('a task that names a module outside this repository', () => {
  const subjectContext: ReadinessContext = {
    ...context,
    existsInSubject: (path) => path === 'src/services/searchIndex.js',
  };

  test('should start when the subject holds the module the task names', () => {
    // Regression: every named path resolved against this repository, so a subject module
    // named precisely was reported as "nothing named to test" — refused for naming its
    // target exactly, which is the opposite of what the check is for.
    expect(
      readinessProblems(
        { role: 'unit-coder', task: 'write unit tests for src/services/searchIndex.js' },
        subjectContext,
      ),
      'a path the subject holds is a named target, not a missing one',
    ).toEqual([]);
  });

  test('should still refuse a path neither the harness nor the subject holds', () => {
    expect(
      readinessProblems(
        { role: 'unit-coder', task: 'write unit tests for src/services/gone.js' },
        subjectContext,
      ).join(' '),
      'the check must not become a rubber stamp',
    ).toContain('nothing named to test');
  });

  test('should refuse the same path when no subject is configured', () => {
    expect(
      readinessProblems(
        { role: 'unit-coder', task: 'write unit tests for src/services/searchIndex.js' },
        context,
      ).join(' '),
      'without a subject root there is nothing to resolve against',
    ).toContain('nothing named to test');
  });
});

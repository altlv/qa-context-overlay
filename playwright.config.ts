import './src/env.js';
import { defineConfig, devices } from '@playwright/test';
import { apps } from './apps/registry.js';
import { defaultTarget, grepForPolicy, targetFor } from './apps/targets.js';
import { isEnvironment } from './src/qe/exploration-policy.js';

// External apps are opt-in: `npm run test:external`. They hit third-party sites,
// so they must never be able to redden a normal run or CI.
const includeExternal = process.env.RUN_EXTERNAL === '1';
const activeApps = apps.filter((app) => includeExternal || app.external !== true);

/**
 * TEST_ENV picks which deployment every app is pointed at, defaulting to each
 * app's own default. It also decides what may run there: on anything but local,
 * only tests that have declared a safe effect execute. An untagged test has an
 * unknown effect, and unknown is not the same as harmless.
 */
const requestedEnv = process.env.TEST_ENV;
if (requestedEnv !== undefined && !isEnvironment(requestedEnv)) {
  throw new Error(`TEST_ENV must be local, test or prod - got "${requestedEnv}"`);
}

const targetOf = (app: (typeof apps)[number]) =>
  (isEnvironment(requestedEnv) ? targetFor(app.name, requestedEnv) : undefined) ??
  defaultTarget(app);

const runnableApps = activeApps.filter(
  (app) => !isEnvironment(requestedEnv) || targetFor(app.name, requestedEnv) !== undefined,
);

/** The app the harness' own self-tests run against. */
const harnessApp = apps.find((app) => app.name === 'todo-fixture');
if (harnessApp === undefined) throw new Error('todo-fixture app config is required');

export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  // External runs write their own results file. They used to share results.json with
  // the local suite, so `npm run test:external` silently replaced the gate's evidence
  // with 22 third-party tests — and the gate, reading that, returned PASS without ever
  // seeing the local suite. Two runs, two files; the gate reads only the local one.
  reporter: [
    process.env.CI ? ['github'] : ['list'],
    ['html', { open: 'never' }],
    [
      'json',
      {
        // A fault run is a third file for the same reason: its failures are the point,
        // and read as the local suite they would turn the gate red.
        // A role run's gate names its own file, so re-running a coder's specs never
        // replaces the results the release gate and plan:facts read.
        outputFile:
          process.env.HARNESS_RESULTS_FILE ??
          (process.env.HARNESS_FAULT === '1'
            ? 'artifacts/results-fault.json'
            : includeExternal
              ? 'artifacts/results-external.json'
              : 'artifacts/results.json'),
      },
    ],
  ],

  use: {
    // Traces and DOM snapshots pair with the network capture: together they are
    // what an agent needs to triage a failure it did not watch happen.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Unit level: the harness's own pure logic. No browser, no server, no network.
    // Playwright Test is a general-purpose runner — it only starts a browser when a
    // test actually asks for `page`, so one runner covers all five levels and the
    // repo needs no second test framework.
    {
      name: 'unit',
      testDir: './tests/unit',
      testMatch: '**/*.test.ts',
    },
    // Integration level: the harness's modules wired together through their real
    // entry points — a spawned CLI, the actual filesystem, real exit codes. No
    // browser and no app under test.
    //
    // This is the layer that catches what unit tests structurally cannot: the CI
    // failure of 2026-09-09 was an unhandled ENOENT in a CLI's argument handling,
    // invisible to every pure-function test and to every browser test.
    {
      name: 'integration',
      testDir: './tests/integration',
      testMatch: '**/*.int.test.ts',
    },
    // One project per app under test, derived from apps/registry.ts. The baseURL
    // and the effect filter both come from the target, so pointing the suite at
    // another environment cannot forget to narrow what runs.
    ...runnableApps.map((app) => {
      const target = targetOf(app);
      const grep = grepForPolicy(target.policy);
      return {
        name: app.name,
        testDir: `./apps/${app.name}/tests`,
        use: { ...devices['Desktop Chrome'], baseURL: target.baseURL },
        ...(grep !== undefined ? { grep } : {}),
      };
    }),
    /**
     * A phone-sized run of the specs that ask for one.
     *
     * **Every report this harness has produced declares the same gap.** The `platform` dimension
     * is one of nine the report format requires, and session after session answers it "only
     * default-size Chromium" — because that is all there was: both projects above pin
     * `devices['Desktop Chrome']`.
     *
     * **This creates the slot, not the coverage**, and the distinction is the whole reason it is
     * written this way. `testMatch` is restricted to `*.mobile.spec.ts`, of which there are
     * currently none, so this project runs nothing today and claims nothing. Widening it to the
     * existing specs would run a suite written for a desktop viewport at 393px and report the
     * layout difference as failures — which is how a platform dimension gets marked "covered"
     * while telling you less than the honest gap did.
     *
     * A spec opts in by being named for it. The first one to do so should be a case that is
     * *different* on a phone — navigation that collapses, a control that moves under the thumb —
     * rather than a desktop assertion re-run narrower.
     *
     * **Agent sessions are not affected and do not need to be.** They already hold
     * `browser_resize`, and `visual-inspection` already tells them to force phone width; no run
     * has done it. That is the enforcement gap under item 100, not a missing capability.
     */
    {
      name: 'mobile',
      testDir: './apps',
      testMatch: '**/*.mobile.spec.ts',
      use: { ...devices['Pixel 5'] },
    },
    // Tests of the harness itself, not of any app.
    {
      name: 'harness',
      testDir: './tests/harness',
      // The fault-check probe exists to be judged under the fault. In any other run it
      // would only be skipped, and a skipped test turns the release gate CONDITIONAL.
      ...(process.env.HARNESS_FAULT === '1' ? {} : { testIgnore: '**/fault-probe.ui.spec.ts' }),
      use: { ...devices['Desktop Chrome'], baseURL: defaultTarget(harnessApp).baseURL },
    },
  ],

  // Only a local deployment is ever started by us; a webServer on any other
  // environment is refused by validateTargets().
  webServer: apps
    .map((app) => targetOf(app))
    .filter((target) => target.webServer !== undefined)
    .map((target) => ({
      command: target.webServer!.command,
      url: target.baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    })),
});

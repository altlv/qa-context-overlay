import type { Environment } from '../src/qe/exploration-policy.js';

export type { Environment };

/**
 * One deployment of an app. The key it is filed under carries the safety
 * meaning: `prod` is real users and real data, whether or not we own it.
 */
export interface AppEnvironment {
  baseURL: string;
  /**
   * Set when the harness starts this deployment itself. Only ever `local`.
   *
   * `portEnv` names the environment variable the server reads its port from. A role run
   * sets it to a free port, and the target's base URL follows, so a run never meets a
   * server left behind by another.
   */
  webServer?: { command: string; port: number; portEnv?: string };
  /** How to reach it, when it is not simply running. Shown by `npm run targets`. */
  note?: string;
}

/**
 * What a test does to the system, declared per test with a Playwright tag.
 *
 * Untagged means *unknown*, and unknown is treated as unsafe: a prod run
 * executes only what has explicitly claimed to be read-only. Safe by default is
 * the point — the alternative is learning a test's effect by watching it run
 * somewhere it should not have.
 */
export const EFFECT_TAGS = {
  readOnly: '@read-only',
  writes: '@writes',
  destructive: '@destructive',
} as const;

export type EffectTag = (typeof EFFECT_TAGS)[keyof typeof EFFECT_TAGS];

/**
 * How a subject's tests are written and run.
 *
 * Facts, not prose. A coder role composes its stack knowledge from here instead of
 * assuming this repo's own Playwright — the assumption that made `unit-coder` unable to
 * produce one valid file for a subject using `node:test`. Every field is something a role
 * would otherwise have to guess or read out of a config file itself.
 */
export interface TestStack {
  /** What runs them: `node --test`, `vitest`, `jest`, `npx playwright test`. */
  runner: string;
  /** The command that runs the whole suite. */
  runAll: string;
  /** The command that runs one file, with the file path appended. */
  runOne: string;
  /** Where tests live, relative to `sourceRepo`, without a trailing slash. */
  testsDir: string;
  /** What marks a file as a test, for the gate and the source map. */
  testFilePattern: string;
  /** `commonjs` | `esm` | `typescript` — how a test file imports what it needs. */
  moduleSystem: string;
  /** One line showing how assertions are obtained, as the subject writes it. */
  assertions: string;
  /** One test file to read as the house style, relative to `sourceRepo`. */
  exemplar: string;
}

export interface AppConfig {
  /** Folder name under apps/, and the Playwright project name. */
  name: string;
  /** One line: what this app is and why it is in the harness. */
  description: string;
  /**
   * Every deployment we can point at. At least one. Apps rarely have all three:
   * a bundled fixture is local-only, a third-party site is prod-only.
   */
  environments: Partial<Record<Environment, AppEnvironment>>;
  /** Used when nothing names an environment. */
  defaultEnvironment: Environment;
  /**
   * CSS scope for page scanning. Without it a scan of a documentation site
   * returns eighty nav links and buries the app's own controls.
   */
  scanScope?: string;
  /**
   * True when the app is not ours — someone else's repository or service.
   *
   * This is **ownership**, not risk; risk is carried by the environment key. It
   * exists so CI can skip suites whose failures would be someone else's outage,
   * because a suite that goes red for reasons the team cannot fix teaches the
   * team to ignore red.
   */
  external?: boolean;
  /** Where the app itself lives, when it is not in this repo. */
  sourceRepo?: string;
  /**
   * Where the subject's own source lives, relative to `sourceRepo`.
   *
   * A role asked to test a module names it the way the subject does — `src/services/x.js`
   * — and readiness resolves that against this, because the path does not exist in this
   * repository and never will.
   */
  sourceRoot?: string;
  /**
   * How the subject's tests are written and run, for a run whose work lands in the
   * subject rather than here. Absent means this repo's own stack.
   */
  testStack?: TestStack;
  /**
   * Hosts a run against this app may reach beyond its base URL — an auth provider, a
   * separate API. The allowlist a role run's browser and shell guard both honour.
   *
   * Here, and nowhere else, so widening is a reviewed commit rather than a flag someone
   * adds to one run, and never something an agent can do for itself mid-run.
   */
  extraHosts?: string[];
}

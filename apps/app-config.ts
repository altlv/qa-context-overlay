import type { Environment } from '../src/qe/exploration-policy.js';
import type { TestStack } from '../src/qe/test-stack.js';

export type { Environment, TestStack };

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

// `TestStack` comes from `src/qe/test-stack.ts` and is re-exported above: the harness's own
// modules never import from `apps/`, so the shape has to live on their side of the line.

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
   * The process this subject's integration tests spawn, relative to the subject.
   *
   * With it the gate can ask the question the mutation set cannot: would a green suite
   * survive the application refusing to boot? A mutation asks whether a rule being wrong
   * would be noticed; a process fault asks whether there being no application would be,
   * which is a different and more embarrassing thing to miss.
   *
   * Absent means the gate says nothing about it, rather than assuming either answer.
   */
  entryPoint?: string;
  /**
   * A named mutation set for one seam, and the suite already holding that seam.
   *
   * The gate's other checks say a test is shaped like a test and currently passes. Neither
   * says it would notice a fault, and the assertion floor states its own blind spot: "a
   * value the test computed for itself is above this floor". A suite of thirty-four tests
   * asserting on its own arithmetic clears every check the gate had.
   *
   * Measured on `mcpa` at `c8d7549`, against the 14 mutations of `src/routes/labs.js`: the
   * subject's hand-written `test/labs-routes.test.js` kills 4, and the file
   * `integration-coder` wrote kills 8. Twice as strong — and weaker on one mutation the
   * hand-written suite catches, which is precisely the kind of regression no other check
   * here can see.
   *
   * `baseline` is what new work is held against, so the bar is the suite that already
   * exists rather than a number someone picked. The rule is `survivors(new) ⊆
   * survivors(baseline)`: a change may not leave the seam weaker than it found it.
   * Survivors above that are reported and do not fail — no real suite kills everything,
   * and a step that can never go green is one people learn to ignore.
   */
  mutations?: {
    /** The mutation module, relative to this repository — subjects are never modified. */
    set: string;
    /** The subject's own suite for that seam, relative to the subject. */
    baseline: string;
  };
  /**
   * What a fresh worktree of this subject needs before its own suite can pass.
   *
   * A worktree holds what git tracks and nothing else, and a subject's tests may need
   * what it does not track. Measured on `mcpa` at `c8d7549`: its three protocol labs are
   * TypeScript projects whose `build/` output is gitignored, so `test/labs-routes.test.js`
   * is **red in a bare worktree** while passing 11 of 11 in the prepared checkout — the
   * registry's endpoints cannot answer 200 for a lab that was never compiled.
   *
   * Red is the dangerous state here rather than merely an inconvenient one, because
   * **a red suite reports every mutation as caught.** A run scored against an unprepared
   * worktree does not fail honestly; it produces a perfect score that means nothing. So
   * this is declared by the subject, run in the worktree before anything judges it, and a
   * step that fails stops the run rather than being noted and passed over.
   *
   * Each entry is a command line and a directory to run it in, relative to the worktree.
   * Ordered: later steps may depend on earlier ones.
   */
  prepare?: { in: string; run: string }[];
  /**
   * Hosts a run against this app may reach beyond its base URL — an auth provider, a
   * separate API. The allowlist a role run's browser and shell guard both honour.
   *
   * Here, and nowhere else, so widening is a reviewed commit rather than a flag someone
   * adds to one run, and never something an agent can do for itself mid-run.
   */
  extraHosts?: string[];
}

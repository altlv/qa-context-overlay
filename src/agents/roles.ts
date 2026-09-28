import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { apiCoder } from './roles/api-coder.js';
import { e2eCoder } from './roles/e2e-coder.js';
import { exploratoryTester } from './roles/exploratory-tester.js';
import { failureInvestigator } from './roles/failure-investigator.js';
import { integrationCoder } from './roles/integration-coder.js';
import { testPlanner } from './roles/test-planner.js';
import { testabilityReviewer } from './roles/testability-reviewer.js';
import { unitCoder } from './roles/unit-coder.js';

/**
 * Every agent role, one file each under `roles/`.
 *
 * Split out of a single 350-line file that grew by fifty lines per role and made
 * every prompt harder to find than the last. The shared blocks live in
 * `common.ts`; each role file carries its own contract — mission, loads, method,
 * boundaries, output — and nothing else.
 *
 * This index is the only place that knows the full set, which is what the role
 * validation tests read.
 */
export const roles: Record<string, AgentDefinition> = {
  'unit-coder': unitCoder,
  'integration-coder': integrationCoder,
  'api-coder': apiCoder,
  'e2e-coder': e2eCoder,
  'testability-reviewer': testabilityReviewer,
  'test-planner': testPlanner,
  'exploratory-tester': exploratoryTester,
  'failure-investigator': failureInvestigator,
};

export type RoleFamily = 'coding' | 'testing';

/**
 * Which half of the work a role does.
 *
 * **coding** produces automation, or the conditions for it: specs, page objects, and
 * the testability findings that decide whether a spec can be written at all.
 * **testing** produces judgement — what deserves coverage, what the product actually
 * does, why something failed — and writes no product or test code.
 *
 * This is data rather than a naming convention because rules hang off it and are
 * enforced in `tests/unit/roles.test.ts`: no testing role holds `Edit`, and
 * `risk-assessment` and `oracle-check` reach the testing family only. A convention
 * alone permits a name that lies, and two of these did — `unit-test-engineer` and
 * `integration-tester` were both coders.
 */
export const families: Record<string, RoleFamily> = {
  'unit-coder': 'coding',
  'integration-coder': 'coding',
  'api-coder': 'coding',
  'e2e-coder': 'coding',
  'testability-reviewer': 'coding',
  'test-planner': 'testing',
  'exploratory-tester': 'testing',
  'failure-investigator': 'testing',
};

/** How much of a browser a role may hold, before the environment narrows it further. */
export type BrowserAccess = 'observe' | 'full';

/**
 * Which roles drive a real browser, and how far.
 *
 * **Family is the wrong axis for this**, which the first version got wrong by
 * excluding coders on the grounds that they write specs running under the harness's
 * own fixtures. True, and beside the point: where a spec *runs* and where its author
 * *looks while writing it* are different questions. `e2e-coder` is told to scan for
 * real selectors and to verify behaviour before designing, and was doing both through
 * Bash and throwaway specs — a worse version of what `browser_generate_locator` does.
 *
 * The real axis is whether a role looks at running software. Four do.
 *
 * `observe` is a ceiling the environment cannot lift: `testability-reviewer` audits
 * and reports, so no environment, local included, is a reason for it to hold
 * `browser_fill_form`. The others need to interact — a failure you cannot reproduce
 * is not localised, and behaviour you have not driven is an assumption. What they
 * actually get is the **intersection** of this ceiling and the environment's policy.
 *
 * Absent means no browser: `api-coder` works through the API fixture, `unit-coder`
 * and `integration-coder` never touch one, and `test-planner` designs from scans
 * rather than from a live page.
 */
export const BROWSER_ACCESS: Record<string, BrowserAccess> = {
  'e2e-coder': 'full',
  'testability-reviewer': 'observe',
  'exploratory-tester': 'full',
  'failure-investigator': 'full',
};

/**
 * How long each role's run may take, in seconds, before the runner stops it.
 *
 * Every role shared one 180-second limit, fixed in `budget.ts` and scaled by nothing,
 * while the coder method asked for a scan, a test run and a mutation run inside it.
 * These are **estimates, not measurements** — no role has run long enough to observe a
 * median. The shape is the claim: exploring and localising take longest, a planner
 * that only reads and writes one file takes least. Replace them with observed figures.
 *
 * The post-run gate runs after this clock stops, so it is not counted here.
 */
export const WALL_CLOCK_SECONDS: Record<string, number> = {
  'unit-coder': 600,
  // Measured: the first live integration run took 2804s against `mcpa`, so 900 would have
  // cut it off at under a third. A seam test spawns a real process and waits for it, and
  // that waiting is wall clock the role cannot compress.
  'integration-coder': 3600,
  'api-coder': 900,
  'e2e-coder': 1200,
  'testability-reviewer': 600,
  'test-planner': 600,
  'exploratory-tester': 1800,
  'failure-investigator': 1200,
};

/** Role names in one family, in the order the index declares them. */
export function rolesIn(family: RoleFamily): string[] {
  return Object.keys(roles).filter((name) => families[name] === family);
}

export {
  apiCoder,
  e2eCoder,
  exploratoryTester,
  failureInvestigator,
  integrationCoder,
  testPlanner,
  testabilityReviewer,
  unitCoder,
};

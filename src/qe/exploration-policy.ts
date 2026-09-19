/**
 * Rules of engagement for an exploratory session.
 *
 * Exploration means interacting with a running system, and what is safe to do
 * depends entirely on which system it is. Deleting a record on a local fixture
 * is a test; the same click on production is an incident. So the rules are
 * agreed per session rather than hardcoded once.
 *
 * Two things follow from that, and both are deliberate:
 *
 *  1. There is **no default environment**. A session cannot start until someone
 *     declares where it is pointed. A wrong guess here is the expensive kind.
 *  2. The policy is **enforced, not advertised**. An agent that reads a checklist
 *     and promises to behave has made a claim. A bound it cannot exceed is
 *     evidence. This repo prefers evidence.
 */

export type Environment = 'local' | 'test' | 'prod';

export const ENVIRONMENTS: Environment[] = ['local', 'test', 'prod'];

export interface ExplorationPolicy {
  environment: Environment;

  /** May interact in ways that change server state at all. */
  allowWrites: boolean;
  /** May submit forms. The highest-risk ordinary action on a real system. */
  allowFormSubmit: boolean;
  /** May click controls that destroy data. */
  allowDestructive: boolean;
  /**
   * May authenticate using credentials we already hold.
   *
   * Deliberately broader than "sign in". A login form is one way; a bearer
   * token, basic auth, an API key or an OAuth exchange are others, and none of
   * them goes near a GUI. Naming this after the front-end act would have quietly
   * excluded every API session from a rule that plainly applies to them.
   *
   * Permitted everywhere, production included: authenticating is how the
   * application is reached at all, and confirming that login and password reset
   * still work is ordinary, valuable production testing.
   *
   * Presenting a credential is the permitted act. *Guessing* one is not, and no
   * environment enables it: repeated failed attempts lock real accounts out and
   * are indistinguishable from an attack.
   */
  allowAuthentication: boolean;
  /** May follow links off the starting origin. */
  stayOnOrigin: boolean;

  /**
   * Whether captured request/response bodies are written to disk.
   *
   * This is the setting people forget. The network log is the most valuable
   * artefact the harness produces and, against production, the most dangerous:
   * it is a file of real payloads. Off by default anywhere but local.
   */
  captureBodies: boolean;

  /** Control labels never clicked, whatever else the policy allows. */
  denyLabels: string[];

  /** Rabbit-hole guards. Whichever trips first ends the session. */
  maxStates: number;
  maxActions: number;
  timeoutMs: number;

  /**
   * How many pages a crawl may fetch here.
   *
   * Crawling is read-only and can still do harm, because the harm is load. These
   * two are not rabbit-hole guards like the fields above — they are politeness,
   * and they belong in the policy for the same reason everything else does: the
   * alternative was a tool that hit production exactly as hard as a local
   * fixture, which is what it did before this existed.
   */
  crawlMaxPages: number;
  /** Minimum gap between requests. A robots.txt Crawl-delay raises it further. */
  crawlDelayMs: number;
}

/**
 * Labels that read as irreversible. Matched case-insensitively against a
 * control's accessible name. Deliberately broad: a false skip costs coverage
 * and is reported as unexplored, while a false click can cost data.
 */
const DESTRUCTIVE_LABELS = [
  'delete',
  'remove',
  'destroy',
  'erase',
  'wipe',
  'purge',
  'deactivate',
  'archive',
  'cancel subscription',
  'close account',
  'revoke',
  'reset',
];

/**
 * Labels that commit to something. Never clicked, anywhere.
 *
 * Clicking to *navigate* is fine — that is how you see anything. These are the
 * clicks that create an account, start a subscription, spend money or send
 * something to a real person: the ones that leave a mark on somebody's records.
 */
const OUTBOUND_LABELS = [
  'sign up',
  'signup',
  'sign-up',
  'register',
  'create account',
  'send',
  'email',
  'invite',
  'publish',
  'post',
  'share',
  'notify',
  'pay',
  'checkout',
  'purchase',
  'order',
  'subscribe',
  'transfer',
];

const PRESETS: Record<Environment, Omit<ExplorationPolicy, 'environment'>> = {
  /** Disposable, resettable, nobody else's data. Explore properly. */
  local: {
    allowWrites: true,
    allowFormSubmit: true,
    allowDestructive: true,
    allowAuthentication: true,
    stayOnOrigin: true,
    captureBodies: true,
    denyLabels: [...OUTBOUND_LABELS],
    maxStates: 40,
    maxActions: 200,
    timeoutMs: 300_000,
    crawlMaxPages: 150,
    crawlDelayMs: 0,
  },

  /**
   * Shared, and meant to be exercised. Your mess is someone else's blocked
   * afternoon — but so is a session that could not reach anything.
   *
   * **Destructive is permitted here as of 2026-09-19** (user's decision). The
   * previous setting refused it, and two things followed that were not intended:
   *
   *  - A session could not reset the application between experiments. On a
   *    client-side app whose state lives in `localStorage`, the whole `RESET` group
   *    was absent, so returning to a known state meant reloading and re-navigating,
   *    spending an action budget on setup rather than on testing.
   *  - `reset` is in `DESTRUCTIVE_LABELS`, so a control named "Reset" — usually the
   *    *safest* thing on a practice app, the one that restores a clean state — was
   *    refused by name.
   *
   * Both halves move together on purpose. They are separate fields and flipping only
   * the flag grants the tools while still refusing "Reset" by label, which is a
   * confusing half-state: able to clear cookies, unable to press the button that does
   * the same thing visibly.
   *
   * **What this gives up.** A test deployment is shared, and a control called "Delete
   * account" is now clickable here. The remaining protections are the effect tags
   * (`effectAllowed` still refuses an untagged spec anywhere but local), the outbound
   * labels below, `maxActions`, `maxStates`, and the fact that a run is scoped to one
   * app and environment at a time. If that proves too loose, the narrower fix is a
   * per-app override — `policyFor` already accepts `Partial<ExplorationPolicy>` — so
   * one subject can differ without moving the tier for everyone.
   */
  test: {
    allowWrites: true,
    allowFormSubmit: true,
    allowDestructive: true,
    allowAuthentication: true,
    stayOnOrigin: true,
    captureBodies: false,
    denyLabels: [...OUTBOUND_LABELS],
    maxStates: 25,
    maxActions: 100,
    timeoutMs: 180_000,
    crawlMaxPages: 50,
    crawlDelayMs: 400,
  },

  /**
   * Real users, real data, real consequences.
   *
   * **Navigation is fine.** Following links and moving between views is how you
   * see anything at all, and a GET changes nothing. What is refused is creating
   * objects, subscribing, purchasing, submitting forms, entering credentials and
   * anything destructive — the actions that leave a mark on someone's account or
   * someone's invoice. Authenticating is not among them: it is how you get to
   * the application, by form or by token, and checking that it still works is
   * worth doing here.
   */
  prod: {
    allowWrites: false,
    allowFormSubmit: false,
    allowDestructive: false,
    allowAuthentication: true,
    stayOnOrigin: true,
    captureBodies: false,
    denyLabels: [...DESTRUCTIVE_LABELS, ...OUTBOUND_LABELS],
    maxStates: 15,
    maxActions: 40,
    timeoutMs: 120_000,
    crawlMaxPages: 25,
    crawlDelayMs: 1_000,
  },
};

export function policyFor(
  environment: Environment,
  overrides: Partial<ExplorationPolicy> = {},
): ExplorationPolicy {
  return { environment, ...PRESETS[environment], ...overrides };
}

export function isEnvironment(value: string | undefined): value is Environment {
  return value !== undefined && (ENVIRONMENTS as string[]).includes(value);
}

/**
 * Types that take typed text. Everything else an `<input>` can be — submit, button,
 * image, reset, checkbox, radio, file — either acts or is not typing.
 *
 * `password` is deliberately absent: it is text entry, but it has its own rule below
 * and a label like "reset password" on a credential field is worth keeping refused.
 */
const TEXT_ENTRY_TYPES = new Set([
  'text',
  'email',
  'search',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'color',
  'range',
]);

/** Whether this control is a box you type into rather than something you press. */
function entersText(control: { tag: string; type: string | null }): boolean {
  if (control.tag === 'textarea') return true;
  if (control.tag !== 'input') return false;
  return TEXT_ENTRY_TYPES.has(control.type ?? 'text');
}

/**
 * Decides whether one control may be interacted with.
 *
 * Returns a reason when the answer is no, because a skipped control has to be
 * reportable. Silent skipping is how a session claims coverage it does not have.
 */
export function actionAllowed(
  policy: ExplorationPolicy,
  control: { label: string | null; tag: string; type: string | null; isSubmit: boolean },
): { allowed: true } | { allowed: false; reason: string } {
  const label = (control.label ?? '').toLowerCase().trim();

  // The label rules are about controls that *do* something — press this and an email
  // goes, a subscription starts, a record dies. Typing into a box does none of that,
  // and applying them to a field refuses "Email Address" on any contact form in the
  // world because the label contains "email". Found by the driver on
  // WebDriverUniversity, 2026-09-19: seven candidates planned and that one field
  // silently dropped, the loss attributed to policy. The module already argued this
  // way further down — "typing into a field is not a write" — and the label check ran
  // first without applying it.
  //
  // **Fail-safe when the caller cannot tell.** `browser-guard.ts` gets an opaque ref
  // and a description the model wrote, so it passes `tag: 'unknown'`, which is not a
  // text field here and keeps the full rule. Only a caller that positively knows it
  // is looking at a text box — the driver, reading a scan — gets the exemption.
  if (!entersText(control)) {
    const denied = policy.denyLabels.find((needle) => label.includes(needle));
    if (denied !== undefined) {
      return { allowed: false, reason: `label contains "${denied}"` };
    }
  }

  if (control.isSubmit && !policy.allowFormSubmit) {
    return { allowed: false, reason: `form submission not permitted on ${policy.environment}` };
  }

  const isPassword = control.type === 'password';
  if (isPassword && !policy.allowAuthentication) {
    return {
      allowed: false,
      reason: `credential entry not permitted on ${policy.environment}`,
    };
  }

  // Typing into a field is not a write. Nothing leaves the browser until
  // something is submitted, and submission is already refused above. Treating
  // text entry as a write blocked authentication on production — which made the
  // read-only rule forbid the one act that reaching the application requires.
  if (!policy.allowWrites && control.isSubmit) {
    return { allowed: false, reason: `read-only session on ${policy.environment}` };
  }

  return { allowed: true };
}

/**
 * The session-start checklist, rendered from the policy actually in force.
 *
 * Printed before a session begins so the rules are on the record next to the
 * findings, and so a reader can tell a thin session from a constrained one.
 */
export function formatChecklist(policy: ExplorationPolicy, target: string): string {
  const yes = (value: boolean): string => (value ? 'YES' : 'NO ');

  return [
    '=== Exploratory session — rules of engagement ===',
    '',
    `  Target        ${target}`,
    `  Environment   ${policy.environment.toUpperCase()}`,
    '',
    '  Permitted',
    '    YES  navigate — follow links, move between views',
    `    ${yes(policy.allowWrites)}  change server state`,
    `    ${yes(policy.allowFormSubmit)}  submit forms`,
    `    ${yes(policy.allowDestructive)}  destructive controls`,
    `    ${yes(policy.allowAuthentication)}  authenticate with credentials we hold (GUI or API)`,
    `    ${yes(policy.captureBodies)}  write request/response bodies to disk`,
    '',
    '  Definite NOs',
    ...policy.denyLabels.map((label) => `    any control whose label contains "${label}"`),
    '    anything off the starting origin',
    '',
    '  Bounds',
    `    ${policy.maxStates} states · ${policy.maxActions} actions · ${Math.round(policy.timeoutMs / 1000)}s`,
    '',
    '  Every control skipped under these rules is reported as unexplored.',
    '  A clean session under a narrow policy is not evidence of a clean system.',
  ].join('\n');
}

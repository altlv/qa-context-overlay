import { test, expect } from '@playwright/test';
import { formatActionPlan, planActions } from '../../src/qe/driver.js';
import { policyFor } from '../../src/qe/exploration-policy.js';
import { ideasFor } from '../../src/qe/test-ideas.js';
import type { PageScan, ScannedElement } from '../../src/tools/page-scanner.js';
import type { EndpointShape, FieldShape } from '../../src/tools/schema.js';

/**
 * The driver's plan joins what the page supports to what the environment permits.
 *
 * Both directions are checked for every rule, because a filter that refuses nothing
 * and a filter that refuses everything both produce a plausible-looking list. The
 * local cases are the control group: the same scan, the same generators, and a policy
 * that permits the thing being refused elsewhere.
 */

const element = (over: Partial<ScannedElement>): ScannedElement => ({
  tag: 'input',
  type: 'text',
  role: null,
  accessibleName: 'Field',
  testId: null,
  affordance: 'input',
  suggested: "getByLabel('Field')",
  unique: true,
  stability: 'text-dependent',
  constraints: {
    name: 'field',
    required: false,
    disabled: false,
    readOnly: false,
    value: '',
    min: null,
    max: null,
    step: null,
    pattern: null,
    maxLength: null,
    options: [],
  },
  stateAttributes: {},
  formIndex: 0,
  blocker: null,
  ...over,
});

function scanOf(interactive: ScannedElement[]): PageScan {
  return {
    url: 'http://local',
    title: 't',
    scannedAt: '2026-09-18T00:00:00.000Z',
    counts: {
      interactive: interactive.length,
      inputs: interactive.filter((entry) => entry.affordance === 'input').length,
      submits: interactive.filter((entry) => entry.affordance === 'submit').length,
      stateful: 0,
      blocked: 0,
      withTestId: 0,
      forms: 1,
      tables: 0,
    },
    frames: [],
    shadowHosts: [],
    interactive,
    endpoints: [],
    testability: [],
  } satisfies PageScan;
}

/** A form that writes: a field plus a submit, which is what tags an idea `@writes`. */
function writingScan(submitName = 'Save'): PageScan {
  return scanOf([
    element({}),
    element({
      tag: 'button',
      type: 'submit',
      affordance: 'submit',
      accessibleName: submitName,
      suggested: `getByRole('button', { name: '${submitName}' })`,
      constraints: null,
    }),
  ]);
}

function planFor(scan: PageScan, environment: 'local' | 'test' | 'prod') {
  const ideas = ideasFor({ scan, dictionary: [] });
  return { ideas, plan: planActions({ ideas, scan, policy: policyFor(environment) }) };
}

test('on local, a writing form is offered in full — the control group', () => {
  const { ideas, plan } = planFor(writingScan(), 'local');

  expect(
    ideas.ideas.length,
    'the fixture must generate something, or the rest of this file proves nothing',
  ).toBeGreaterThan(0);
  expect(
    plan.candidates,
    'a disposable fixture permits every one of these; dropping any is refusing coverage nobody asked it to refuse',
  ).toHaveLength(ideas.ideas.length);
  expect(plan.skipped, 'nothing on local should be refused by this policy').toHaveLength(0);
});

test('on prod, every writing idea is refused, and the reason names the environment', () => {
  const { ideas, plan } = planFor(writingScan(), 'prod');

  const writes = ideas.ideas.filter((idea) => idea.tag === '@writes');
  expect(
    writes.length,
    'this scan must produce writing ideas, or the rule has no target to fire on',
  ).toBeGreaterThan(0);

  const refusedTargets = new Set(plan.skipped.map((entry) => entry.idea.target));
  for (const idea of writes) {
    expect(
      refusedTargets,
      `a case that changes server state reached a production plan: ${idea.target}`,
    ).toContain(idea.target);
  }
  expect(
    plan.skipped.every((entry) => entry.reason.includes('prod')),
    'a refusal that does not name where it applies cannot be reported or argued with',
  ).toBe(true);
  expect(
    plan.candidates.length + plan.skipped.length,
    'every idea must come out one side or the other — a silently dropped one is coverage nobody knows was lost',
  ).toBe(ideas.ideas.length);
});

test('an idea whose effect was never established is not treated as a read', () => {
  // A password field makes `ideasFor` leave the whole form untagged: it cannot say
  // what submitting does. Unknown must not read as read-only on a read-only policy.
  const scan = scanOf([
    element({ type: 'password', accessibleName: 'Password', suggested: "getByLabel('Password')" }),
    element({ constraints: { ...element({}).constraints!, required: true } }),
  ]);
  const { ideas, plan } = planFor(scan, 'prod');

  expect(
    ideas.ideas.some((idea) => idea.tag === null),
    'the fixture must produce an untagged idea, or this rule is tested against nothing',
  ).toBe(true);
  expect(
    plan.candidates,
    'an unproven effect was offered on production — reading "unknown" as "read-only" puts the unestablished case where it can least be absorbed',
  ).toHaveLength(0);
  expect(
    plan.skipped[0]?.reason,
    'the refusal has to say the effect was never established, not merely that something was refused',
  ).toContain('effect not established');
});

test('a committing label is refused even on local, where writes are permitted', () => {
  const { plan } = planFor(writingScan('Subscribe'), 'local');

  const refused = plan.skipped.filter((entry) => entry.idea.target.includes('Subscribe'));
  expect(
    refused.length,
    'subscribing leaves a mark on a real person’s records, and a disposable fixture is no argument for pressing it',
  ).toBeGreaterThan(0);
  expect(refused[0]?.reason, 'the refusal must name the label that caused it').toContain(
    'subscribe',
  );
  expect(
    plan.candidates.length,
    'one committing control must not refuse the whole page — that is a blanket refusal in a label rule’s clothes',
  ).toBeGreaterThan(0);
});

test('a candidate carries the control label, and a group idea admits it has none', () => {
  const scan = scanOf([
    element({
      type: 'checkbox',
      affordance: 'toggle',
      accessibleName: 'First',
      suggested: "getByLabel('First')",
      stateAttributes: { checked: 'false' },
    }),
    element({
      type: 'checkbox',
      affordance: 'toggle',
      accessibleName: 'Second',
      suggested: "getByLabel('Second')",
      stateAttributes: { checked: 'false' },
    }),
  ]);
  const { plan } = planFor(scan, 'local');
  const all = [...plan.candidates, ...plan.skipped];

  expect(
    all.find((entry) => entry.idea.target === "getByLabel('First')")?.label,
    'the label is what a report quotes and what the deny rule reads; losing it silently weakens both',
  ).toBe('First');
  const group = all.find((entry) => entry.idea.target.includes('checkboxes in'));
  expect(
    group,
    'the group idea must survive into the plan rather than being filtered out',
  ).toBeDefined();
  expect(
    group?.label,
    'a case covering several controls has no single label, and inventing one would misattribute it',
  ).toBeNull();
});

test('an API idea is carried through as api, with no control and no label', () => {
  const field = (path: string): FieldShape => ({
    path,
    types: ['number'],
    nullable: false,
    optional: false,
    sample: '1',
    seen: 1,
  });
  const endpoint = (method: string, request: FieldShape[], response: FieldShape[]): EndpointShape =>
    ({
      method,
      template: '/items',
      examples: ['/items'],
      statuses: [method === 'POST' ? 201 : 200],
      calls: 1,
      request,
      response,
    }) satisfies EndpointShape;
  const scan = writingScan();
  const dictionary = [
    endpoint('POST', [field('id')], [field('id')]),
    endpoint('GET', [], [field('id')]),
  ];
  const ideas = ideasFor({ scan, dictionary });
  const plan = planActions({ ideas, scan, policy: policyFor('local') });
  const all = [...plan.candidates, ...plan.skipped];

  const api = all.filter((entry) => entry.via === 'api');
  expect(
    api.length,
    'the dictionary must produce API ideas, or this case is asserting over an empty list',
  ).toBeGreaterThan(0);
  expect(
    api.every((entry) => entry.label === null),
    'an endpoint is not a selector, so a label here is a control the plan invented',
  ).toBe(true);
  expect(
    api.some((entry) => entry.idea.target.includes(' → ')),
    'the read-back form is the shape an earlier version mis-parsed as a selector; keep a case on it',
  ).toBe(true);
  expect(
    all.filter((entry) => entry.via === 'browser').length,
    'browser ideas must not be swallowed by the API branch',
  ).toBeGreaterThan(0);
});

test('the rendered plan prints its refusals and admits its blind spot', () => {
  const { plan } = planFor(writingScan('Subscribe'), 'local');
  const text = formatActionPlan(plan, 'local');

  expect(text, 'the candidate section is the point of the artefact').toContain('Candidate actions');
  expect(
    text,
    'a session reporting "explored everything permitted" is only readable beside what that excluded',
  ).toContain('report these as unexplored');
  expect(text, 'the refused control must be named, not counted').toContain('Subscribe');
  expect(
    text,
    'silence reads as coverage: the plan is built from one page state and has to say so in its own output',
  ).toContain('ONE state');
});

test('a plan with nothing refused prints no refusal section', () => {
  const { plan } = planFor(writingScan(), 'local');

  expect(
    formatActionPlan(plan, 'local'),
    'an empty refusal section would teach a reader to skip the one that matters',
  ).not.toContain('report these as unexplored');
});

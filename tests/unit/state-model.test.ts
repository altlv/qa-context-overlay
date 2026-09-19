import { test, expect } from '@playwright/test';
import {
  StateModel,
  controlSignature,
  describeTransition,
  stateKey,
} from '../../src/qe/state-model.js';
import type { Fingerprint } from '../../src/tools/identity.js';

/**
 * The state model decides what `maxStates` counts, so every rule here is really a
 * rule about when a session gets cut off. Both directions matter equally: a model
 * that counts too eagerly spends the allowance on a list being used normally, and one
 * that counts too little reports an exploration as complete after eight clicks.
 */

const control = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  tag: 'button',
  role: 'button',
  name: 'Save',
  testId: null,
  fieldName: null,
  id: null,
  type: null,
  href: null,
  ancestors: ['main', 'form'],
  siblingIndex: 0,
  nearbyText: null,
  constraints: null,
  ...over,
});

const at = (url: string, fingerprints: Fingerprint[]) => ({ url, fingerprints });

test('a list growing is not a new state', () => {
  // The rule that earned the set-not-multiset choice: three identical Delete buttons
  // and four are the same screen, and counting them would burn the ceiling on a user
  // adding todos.
  const row = (index: number) =>
    control({ name: 'Delete', siblingIndex: index, nearbyText: `Item ${index}` });
  const model = new StateModel();

  model.observe(at('/todos', [row(0), row(1)]));
  const after = model.observe(at('/todos', [row(0), row(1), row(2)]));

  expect(
    after.isNewState,
    'a list with one more row is the same screen; counting it spends a ceiling meant for navigation',
  ).toBe(false);
  expect(model.count(), 'the second look must not add a state').toBe(1);
});

test('a modal opening is a new state', () => {
  // The case item 4 exists for. Distinct controls arrive without the URL moving, so
  // anything keyed on the URL alone would miss it entirely.
  const model = new StateModel();
  model.observe(at('/cart', [control({ name: 'Checkout' })]));

  const opened = model.observe(
    at('/cart', [
      control({ name: 'Checkout' }),
      control({ name: 'Confirm order' }),
      control({ name: 'Keep shopping' }),
    ]),
  );

  expect(
    opened.isNewState,
    'a surface that opens without changing the URL must still register, or transient state is invisible',
  ).toBe(true);
  expect(
    opened.appeared.map((entry) => entry.name).sort(),
    'the controls the modal brought must be reported as appeared, not as churn',
  ).toEqual(['Confirm order', 'Keep shopping']);
  expect(opened.disappeared, 'nothing left the page when the modal opened').toHaveLength(0);
});

test('returning to a state already visited does not count again', () => {
  const model = new StateModel();
  const home = at('/', [control({ name: 'Open' })]);
  const other = at('/other', [control({ name: 'Back' })]);

  model.observe(home);
  model.observe(other);
  const back = model.observe(home);

  expect(
    back.isNewState,
    'a session that goes back and forth must not exhaust its allowance doing so',
  ).toBe(false);
  expect(model.count(), 'two distinct places were visited, not three').toBe(2);
});

test('the same controls at a different URL are different states', () => {
  // A paginated list carries identical controls on every page. Folding those together
  // would hide a whole route from the count and from the report.
  const model = new StateModel();
  model.observe(at('/list?page=1', [control({ name: 'Next' })]));
  model.observe(at('/list?page=2', [control({ name: 'Next' })]));

  expect(model.count(), 'two routes with the same controls are still two places').toBe(2);
});

test('volatile signals do not make a new state', () => {
  // The countdown timer is the standing example: its display changes every second
  // while its controls do not. Keying on surrounding text would count a state per tick.
  const model = new StateModel();
  model.observe(at('/timer', [control({ name: 'Start', nearbyText: '00:10', siblingIndex: 0 })]));
  model.observe(at('/timer', [control({ name: 'Start', nearbyText: '00:09', siblingIndex: 3 })]));

  expect(
    model.count(),
    'a page whose copy ticks would otherwise reach any ceiling without a single real transition',
  ).toBe(1);
});

test('the ceiling is reached, not exceeded silently', () => {
  const model = new StateModel();
  expect(model.atCeiling(2), 'an empty model has spent nothing').toBe(false);

  model.observe(at('/a', [control({})]));
  expect(model.atCeiling(2), 'one state of two is not the ceiling').toBe(false);

  model.observe(at('/b', [control({ name: 'Other' })]));
  expect(
    model.atCeiling(2),
    'the guard has to refuse at the limit; letting it pass is how a bound becomes advice',
  ).toBe(true);
});

test('a control renamed in place is reported as changed, not as churn', () => {
  // Without identity matching this reads as one control gone and another arrived,
  // which is exactly the failure `identity.ts` was built to end.
  const model = new StateModel();
  const before = control({ name: 'Save', fieldName: 'order', id: 'submit-order' });
  model.observe(at('/form', [before]));

  const transition = model.observe(
    at('/form', [control({ name: 'Save changes', fieldName: 'order', id: 'submit-order' })]),
  );

  expect(
    transition.appeared,
    'a rename is not an arrival; reporting it as one hides that the control is the same one',
  ).toHaveLength(0);
  expect(transition.disappeared, 'and it is not a departure either').toHaveLength(0);
  expect(
    transition.changed[0]?.disagreed,
    'the pairing must say which signal moved, or a reviewer cannot judge it',
  ).toContain('name');
});

test('a click that moves nothing says so', () => {
  const model = new StateModel();
  const page = at('/', [control({})]);
  model.observe(page);

  expect(
    describeTransition(model.observe(page)),
    'a dead control is a finding, and silence here reads as a successful action',
  ).toMatch(/nothing observable changed/);
});

test('the first observation describes no transition', () => {
  const model = new StateModel();

  expect(
    describeTransition(model.observe(at('/', [control({})]))),
    'there is nothing to compare the first look against, and inventing a diff would be a lie',
  ).toBeNull();
});

test('a signature ignores the signals that churn and keeps the ones that identify', () => {
  const base = control({ name: 'Save', fieldName: 'order', type: 'submit' });

  expect(
    controlSignature(control({ ...base, nearbyText: 'anything', siblingIndex: 99, id: 'x1' })),
    'text, position and generated ids must not reach the key',
  ).toBe(controlSignature(base));
  expect(
    controlSignature(control({ ...base, name: 'Delete' })),
    'the accessible name is how a new surface announces itself and must reach the key',
  ).not.toBe(controlSignature(base));
});

test('two screens with identical controls fold into one — the stated blind spot', () => {
  // Asserted rather than left implied, so the day it matters there is a test naming it
  // instead of a surprise.
  const model = new StateModel();
  model.observe(at('/receipt', [control({ name: 'Done', nearbyText: 'Order 1 confirmed' })]));
  model.observe(at('/receipt', [control({ name: 'Done', nearbyText: 'Order 2 confirmed' })]));

  expect(
    model.count(),
    'content-only differences are invisible to this model; if that stops being acceptable, the key is what changes',
  ).toBe(1);
});

test('the key does not depend on the order the DOM walk returned', () => {
  const one = control({ name: 'A' });
  const two = control({ name: 'B' });

  expect(stateKey(at('/', [one, two])), 'an unsorted key made a re-render into a new state').toBe(
    stateKey(at('/', [two, one])),
  );
});

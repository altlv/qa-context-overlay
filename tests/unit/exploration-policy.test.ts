import { test, expect } from '@playwright/test';
import {
  actionAllowed,
  formatChecklist,
  isEnvironment,
  policyFor,
  ENVIRONMENTS,
} from '../../src/qe/exploration-policy.js';

/**
 * The policy exists to be enforced rather than promised. These tests are the
 * enforcement: each one pins a rule that, if it silently regressed, would let a
 * session do something on production that nobody agreed to.
 */

const control = (
  overrides: Partial<{
    label: string | null;
    tag: string;
    type: string | null;
    isSubmit: boolean;
  }> = {},
) => ({ label: 'Open', tag: 'button', type: null, isSubmit: false, ...overrides });

test.describe('environment presets', () => {
  test('should forbid every state-changing action on prod', () => {
    const policy = policyFor('prod');

    expect(policy.allowWrites, 'a production session must be read-only').toBe(false);
    expect(policy.allowFormSubmit, 'submitting a real form is the highest-risk click').toBe(false);
    expect(policy.allowDestructive, 'destructive controls are never permitted on prod').toBe(false);
    expect(
      policy.allowAuthentication,
      'authenticating — by form or by token — is how the application is reached at all; it is signing *up* that is barred',
    ).toBe(true);
  });

  test('should not write payload bodies to disk on anything but local', () => {
    expect(
      policyFor('prod').captureBodies,
      'the network log holds real request and response bodies; on prod that is user data written to disk',
    ).toBe(false);
    expect(
      policyFor('test').captureBodies,
      'a shared environment carries other people data too, so bodies stay out of the log',
    ).toBe(false);
    expect(
      policyFor('local').captureBodies,
      'on a disposable local fixture the bodies are the whole value of the log',
    ).toBe(true);
  });

  test('should give every environment a finite bound so no session can run open-ended', () => {
    for (const environment of ENVIRONMENTS) {
      const policy = policyFor(environment);
      expect(
        policy.maxActions,
        `${environment} must cap actions, or a session can loop until someone notices`,
      ).toBeGreaterThan(0);
      expect(policy.timeoutMs, `${environment} must cap wall-clock time`).toBeGreaterThan(0);
    }
  });

  test('should tighten monotonically from local to prod', () => {
    expect(
      policyFor('prod').maxActions,
      'prod must not permit more interaction than a disposable local app',
    ).toBeLessThan(policyFor('local').maxActions);
  });
});

test.describe('actionAllowed', () => {
  test('should refuse a control whose label reads destructive, and say why', () => {
    // Moved from `test` to `prod` on 2026-09-19 when the test tier gained
    // allowDestructive. The rule did not change; the tier carrying it did.
    const verdict = actionAllowed(policyFor('prod'), control({ label: 'Delete account' }));

    expect(verdict.allowed, 'a Delete control must not be clicked against real users').toBe(false);
    expect(
      verdict.allowed === false ? verdict.reason : '',
      'a refusal must carry a reason, because every skipped control is reported as unexplored',
    ).toContain('delete');
  });

  test('should refuse outbound actions even on local, because the effect leaves the system', () => {
    const verdict = actionAllowed(policyFor('local'), control({ label: 'Send invite' }));

    expect(
      verdict.allowed,
      'local is disposable but a real email is not — outbound actions are denied everywhere',
    ).toBe(false);
  });

  test('should refuse form submission on prod but permit it locally', () => {
    const submit = control({ label: 'Save', tag: 'button', isSubmit: true });

    expect(actionAllowed(policyFor('prod'), submit).allowed, 'prod sessions never submit').toBe(
      false,
    );
    expect(
      actionAllowed(policyFor('local'), submit).allowed,
      'a local session that cannot submit a form cannot explore anything interesting',
    ).toBe(true);
  });

  test('should refuse a submit on the form-submit rule alone, with writes otherwise allowed', () => {
    // Deliberately isolates the rule. Testing this on prod proves nothing: there
    // allowWrites is already false and catches the submit anyway, so the
    // form-submit rule could be deleted and the suite would stay green. A
    // surviving mutation is what exposed that.
    const policy = policyFor('local', { allowFormSubmit: false });
    const verdict = actionAllowed(policy, control({ label: 'Save', isSubmit: true }));

    expect(
      verdict.allowed,
      'the form-submit rule must refuse on its own, not rely on the read-only rule behind it',
    ).toBe(false);
    expect(
      verdict.allowed === false ? verdict.reason : '',
      'the refusal must be attributed to form submission, not to a read-only session',
    ).toContain('form submission');
  });

  test('should permit authenticating, while still refusing to create an account', () => {
    expect(
      actionAllowed(
        policyFor('prod'),
        control({ label: 'Password', tag: 'input', type: 'password' }),
      ).allowed,
      'barring authentication would make production untestable — reaching the app requires it',
    ).toBe(true);

    expect(
      actionAllowed(policyFor('prod'), control({ label: 'Sign up' })).allowed,
      'authenticating uses an account we already hold; signing up creates one nobody asked for',
    ).toBe(false);
  });

  test('should permit an ordinary navigation control on prod', () => {
    expect(
      actionAllowed(policyFor('prod'), control({ label: 'View details', tag: 'a' })).allowed,
      'a read-only session must still be able to look around, or prod exploration is pointless',
    ).toBe(true);
  });

  test('should match a denied label case-insensitively and inside a longer label', () => {
    expect(
      actionAllowed(policyFor('prod'), control({ label: '  Remove This Item  ' })).allowed,
      'label matching must survive casing and padding, or the guard is trivially bypassed',
    ).toBe(false);
  });
});

test.describe('isEnvironment', () => {
  test('should reject an undeclared or unknown environment so a session cannot default into one', () => {
    expect(isEnvironment(undefined), 'there is deliberately no default environment').toBe(false);
    expect(isEnvironment('production'), 'only the three known names are accepted').toBe(false);
    expect(isEnvironment('prod'), 'a declared known environment is accepted').toBe(true);
  });
});

test.describe('formatChecklist', () => {
  test('should state the environment, the definite NOs and the honesty clause', () => {
    const rendered = formatChecklist(policyFor('prod'), 'https://app.example.com');

    expect(rendered, 'the checklist must name the environment it was rendered for').toContain(
      'PROD',
    );
    expect(rendered, 'the checklist must name the target').toContain('https://app.example.com');
    expect(rendered, 'the definite NOs must be listed, not implied').toContain('Definite NOs');
    expect(
      rendered,
      'the report must carry the warning that a constrained clean session proves little',
    ).toContain('not evidence of a clean system');
  });
});

test.describe('label rules apply to controls that act, not to boxes you type in', () => {
  const field = (label: string, type = 'text') => ({ label, tag: 'input', type, isSubmit: false });
  const button = (label: string) => ({ label, tag: 'button', type: null, isSubmit: false });

  test('should let a session type into a field labelled Email Address', () => {
    // Found by the driver on WebDriverUniversity's contact form, 2026-09-19: seven
    // candidates planned and this one dropped, because "email address" contains
    // "email" — a rule meant to stop pressing something that mails a real person.
    expect(
      actionAllowed(policyFor('test'), field('Email Address', 'email')).allowed,
      'refusing an email field loses that field on every contact form there is, and blames the policy for it',
    ).toBe(true);
  });

  test('should still refuse a control that acts on the same word', () => {
    // The rule must keep doing its job; this is the case it was written for.
    const verdict = actionAllowed(policyFor('test'), button('Email this to a friend'));

    expect(verdict.allowed, 'pressing this sends mail to a real person').toBe(false);
    expect(
      verdict.allowed ? '' : verdict.reason,
      'the refusal must still name the label that caused it',
    ).toContain('email');
  });

  test('should refuse when the caller cannot tell what the control is', () => {
    // browser-guard sees an opaque ref and a description the model wrote, so it passes
    // tag 'unknown'. That must keep the full rule: the exemption is for a caller that
    // positively knows it is looking at a text box, never a default.
    expect(
      actionAllowed(policyFor('prod'), {
        label: 'Delete everything',
        tag: 'unknown',
        type: null,
        isSubmit: false,
      }).allowed,
      'an exemption that applies when nothing is known is not an exemption, it is a hole',
    ).toBe(false);
  });

  test('should keep refusing a destructive label on a checkbox, which acts', () => {
    expect(
      actionAllowed(policyFor('prod'), {
        label: 'Delete my account',
        tag: 'input',
        type: 'checkbox',
        isSubmit: false,
      }).allowed,
      'a checkbox is pressed, not typed into, so the label rule still applies to it',
    ).toBe(false);
  });

  test('should keep refusing a credential field whose label reads destructive', () => {
    // password is left out of the text-entry set on purpose.
    expect(
      actionAllowed(policyFor('prod'), field('Reset password', 'password')).allowed,
      'a password box is text entry and still not somewhere to relax a label rule',
    ).toBe(false);
  });
});

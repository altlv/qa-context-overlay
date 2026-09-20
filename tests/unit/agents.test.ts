import { test, expect } from '@playwright/test';
import { Budget } from '../../src/agents/budget.js';
import { isAuthFailure } from '../../src/agents/client.js';
import { extractJson, triageVerdictSchema } from '../../src/agents/triage.js';
import {
  auditTestability,
  markUniqueness,
  type ScannedElement,
} from '../../src/tools/page-scanner.js';

test.describe('budget — the rabbit-hole guard', () => {
  test('should not be exceeded before anything is spent', () => {
    const budget = new Budget({ maxTurns: 5, maxUsd: 1, timeoutMs: 60_000 });
    expect(budget.exceeded()).toBeNull();
  });

  test('should stop the run at the turn limit', () => {
    const budget = new Budget({ maxTurns: 3, maxUsd: 1, timeoutMs: 60_000 });
    budget.record({ turns: 3 });
    expect(budget.exceeded()).toContain('turn limit');
  });

  test('should stop the run at the spend limit', () => {
    const budget = new Budget({ maxTurns: 100, maxUsd: 0.5, timeoutMs: 60_000 });
    budget.record({ costUsd: 0.5 });
    expect(budget.exceeded()).toContain('spend limit');
  });

  test('should stop the run on elapsed time', () => {
    const budget = new Budget({ maxTurns: 100, maxUsd: 100, timeoutMs: 0 });
    expect(budget.exceeded()).toContain('timeout');
  });

  test('should keep running while under every limit', () => {
    const budget = new Budget({ maxTurns: 10, maxUsd: 1, timeoutMs: 60_000 });
    budget.record({ turns: 9, costUsd: 0.99 });
    expect(budget.exceeded()).toBeNull();
  });

  test('should abort the underlying controller when told to stop', () => {
    const budget = new Budget();
    expect(budget.controller.signal.aborted, 'a fresh budget must not start aborted').toBe(false);
    budget.abort('turn limit');
    expect(
      budget.controller.signal.aborted,
      'abort did not signal the controller, so an over-budget agent would keep running',
    ).toBe(true);
  });
});

test.describe('triage output parsing', () => {
  const valid = {
    classification: 'infrastructure',
    confidence: 'high',
    summary: 'The POST returned 403, so the session had expired.',
    evidence: ['POST /api/todos -> 403'],
    suggestedFix: 'Re-run auth setup.',
  };

  test('should read a bare JSON reply', () => {
    expect(extractJson(JSON.stringify(valid))).toMatchObject({ classification: 'infrastructure' });
  });

  test('should read a reply wrapped in a fenced code block', () => {
    const fenced = '```json\n' + JSON.stringify(valid) + '\n```';
    expect(extractJson(fenced)).toMatchObject({ classification: 'infrastructure' });
  });

  test('should read JSON surrounded by prose', () => {
    const chatty = `Here is my analysis:\n${JSON.stringify(valid)}\nHope that helps.`;
    expect(extractJson(chatty)).toMatchObject({ classification: 'infrastructure' });
  });

  test('should return null when there is no JSON at all', () => {
    expect(extractJson('I could not determine the cause.')).toBeNull();
  });

  test('should return null on malformed JSON rather than throwing', () => {
    expect(
      extractJson('{"classification": "infra"'),
      'malformed JSON should yield null, not throw — a bad reply must degrade, not crash the run',
    ).toBeNull();
  });

  test('should accept a verdict that carries evidence', () => {
    expect(triageVerdictSchema.safeParse(valid).success).toBe(true);
  });

  test('should reject a verdict with no evidence — no evidence, no verdict', () => {
    expect(triageVerdictSchema.safeParse({ ...valid, evidence: [] }).success).toBe(false);
  });

  test('should reject an invented classification', () => {
    expect(triageVerdictSchema.safeParse({ ...valid, classification: 'gremlins' }).success).toBe(
      false,
    );
  });
});

test.describe('markUniqueness', () => {
  test('should flag every element sharing a suggested selector', () => {
    const marked = markUniqueness([
      { suggested: "getByRole('button', { name: 'Edit' })" },
      { suggested: "getByRole('button', { name: 'Edit' })" },
      { suggested: "getByRole('button', { name: 'Delete' })" },
    ]);

    expect(
      marked.filter((el) => !el.unique),
      'both duplicates must be flagged — each one is separately unusable as a selector',
    ).toHaveLength(2);
    expect(
      marked[2]?.unique,
      'the distinctly named control must stay unique, or the rule would flag everything',
    ).toBe(true);
  });

  test('should treat a single element as unique', () => {
    expect(
      markUniqueness([{ suggested: "locator('#save')" }])[0]?.unique,
      'one element with one selector is unambiguous; reporting otherwise would be noise',
    ).toBe(true);
  });
});

test.describe('testability grading', () => {
  function element(over: Partial<ScannedElement>): ScannedElement {
    return {
      tag: 'button',
      type: null,
      role: null,
      accessibleName: 'Save',
      testId: null,
      affordance: 'control',
      suggested: "getByRole('button', { name: 'Save' })",
      unique: true,
      stability: 'text-dependent',
      constraints: null,
      stateAttributes: {},
      formIndex: null,
      blocker: null,
      ...over,
    };
  }

  test('should raise nothing for a uniquely named control that has no test id', () => {
    expect(
      auditTestability([element({})]),
      'most real apps have no test ids; a uniquely named control is testable and must not be reported as a defect',
    ).toEqual([]);
  });

  test('should raise a high finding when a selector matches more than one element', () => {
    const [issue] = auditTestability([element({ unique: false })]);

    expect(
      issue?.kind,
      'ambiguity is the failure that actually breaks a run, via strict-mode violation',
    ).toBe('ambiguous');
    expect(issue?.severity, 'an ambiguous selector cannot be worked around at test level').toBe(
      'high',
    );
  });

  test('should raise a high finding for an element reachable only by position', () => {
    const [issue] = auditTestability([element({ accessibleName: null, stability: 'fragile' })]);

    expect(
      issue?.kind,
      'no name, no id and no test id leaves only positional selectors, which is the fragile case worth flagging',
    ).toBe('unaddressable');
    expect(
      issue?.severity,
      'an element reachable only by position cannot be worked around at test level, so it is not a nice-to-have',
    ).toBe('high');
  });

  test('should raise a high finding for an input with no label', () => {
    const [issue] = auditTestability([
      element({ tag: 'input', affordance: 'input', accessibleName: null, stability: 'fragile' }),
    ]);

    expect(
      issue?.kind,
      'an unlabelled input blocks both the test and anyone using assistive technology',
    ).toBe('unlabelled-input');
  });

  test('should raise a finding when a toggle exposes no state to assert against', () => {
    const [issue] = auditTestability([
      element({ affordance: 'toggle', accessibleName: 'Show details', stateAttributes: {} }),
    ]);

    expect(
      issue?.kind,
      'a control you can act on but cannot observe leaves an interaction with no assertable outcome — the core exploration problem',
    ).toBe('no-observable-state');
  });

  test('should stay silent when a toggle does expose its state', () => {
    expect(
      auditTestability([
        element({
          affordance: 'toggle',
          accessibleName: 'Show details',
          stateAttributes: { 'aria-expanded': 'false' },
        }),
      ]),
      'a toggle carrying aria-expanded is exactly what good looks like and must not be flagged',
    ).toEqual([]);
  });

  test('should report only the most serious problem per element', () => {
    const issues = auditTestability([element({ unique: false, stability: 'fragile' })]);

    expect(
      issues,
      'one element must not generate a pile of findings; the ambiguity is the thing to fix first',
    ).toHaveLength(1);
  });

  test('should raise a finding for a control covered by an overlay', () => {
    const [issue] = auditTestability([element({ blocker: 'covered by <div#cookie-banner>' })]);

    expect(
      issue?.kind,
      'identifying an element is only half of testability — a covered control is findable and still unusable',
    ).toBe('unreachable');
    expect(
      issue?.problem,
      'the report must name what is covering it, or the reader cannot act on the finding',
    ).toContain('cookie-banner');
  });

  test('should treat disabled and readonly as product states, not defects', () => {
    expect(
      auditTestability([element({ blocker: 'disabled' })]),
      'a deliberately disabled control is normal; flagging it would bury the real blockers',
    ).toEqual([]);
    expect(
      auditTestability([
        element({ tag: 'input', affordance: 'input', accessibleName: 'Ref', blocker: 'readonly' }),
      ]),
      'readonly is a product decision, not a testability failure',
    ).toEqual([]);
  });

  test('should declare an unscanned frame rather than reporting a clean page', () => {
    const [issue] = auditTestability([], ['/embedded/checkout']);

    expect(
      issue?.kind,
      'the scan cannot cross into frames, and silence about that is a wrong answer stated confidently',
    ).toBe('unscanned-frame');
    expect(
      issue?.problem,
      'the finding must say the clean result above does not cover the frame content',
    ).toContain('unexamined');
  });

  test('should name a concrete fix in every finding', () => {
    const issues = auditTestability([
      element({ unique: false }),
      element({ accessibleName: null, stability: 'fragile' }),
      element({ affordance: 'toggle', accessibleName: 'Toggle grid' }),
    ]);

    expect(issues, 'each of the three distinct problems must be reported').toHaveLength(3);
    for (const issue of issues) {
      expect(
        issue.suggestion.length,
        'a finding without a fix is noise, and noise is how a gate gets ignored',
      ).toBeGreaterThan(20);
    }
  });
});

test.describe('auth failures — recognised, not thrown as a stack trace', () => {
  test('should recognise the message a signed-out Claude Code CLI returns', () => {
    // Observed verbatim on the first live run, and matched by none of the original
    // patterns. Keeping the real string here is the point of the test.
    const error = new Error(
      'Claude Code returned an error result: Not logged in · Please run /login',
    );
    expect(
      isAuthFailure(error),
      'a signed-out CLI must reach AgentAuthError, not escape as an SDK stack',
    ).toBe(true);
  });

  test('should recognise an API-key rejection', () => {
    expect(
      isAuthFailure(new Error('401 Unauthorized: invalid x-api-key')),
      'a rejected key is an auth failure',
    ).toBe(true);
  });

  test('should not treat an ordinary run failure as an auth failure', () => {
    expect(
      isAuthFailure(new Error('Maximum number of turns (30) reached')),
      'a budget stop must stay a budget stop, or the run reports the wrong cause',
    ).toBe(false);
  });
});

import { test, expect } from '@playwright/test';
import { describeBudget, type BudgetLine } from '../../src/agents/budget-line.js';

/**
 * The budget banner is the only place a run says what it is about to spend, and the only place an
 * operator's override can be seen. It went untested because it was inline in a CLI, and a real
 * defect lived there: a 180s `AGENT_TIMEOUT_MS` replaced a role's declared 600s while the line still
 * read as the role's own budget.
 */

const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({
  role: 'unit-coder',
  modelId: 'claude-sonnet-5',
  tier: 'sonnet',
  declaredTurns: 20,
  declaredSeconds: 600,
  maxTurns: 20,
  maxUsd: 1,
  timeoutSeconds: 600,
  measuringSpendOnly: false,
  overrodeTurns: false,
  overrodeUsd: false,
  overrodeTimeout: false,
  ...over,
});

test.describe('the budget line', () => {
  test('should say what the role asked for when nothing overrode it', () => {
    const text = describeBudget(line());

    expect(text, 'the role, the model and the tier are the first thing a reader checks').toContain(
      'Running unit-coder on claude-sonnet-5 (sonnet)',
    );
    expect(text).toContain('max 20 turns');
    expect(text).toContain('$1.00');
    expect(text, 'and the role’s own wall clock, not a default').toContain('600s');
    expect(text).toContain('role asks 20 × sonnet');
  });

  test('should not claim an override that did not happen', () => {
    // A banner that cries override on every run is one nobody reads, which is how the real one
    // survived a run that was stopped by a variable nobody had set deliberately.
    const text = describeBudget(line());

    expect(text).not.toContain('AGENT_TIMEOUT_MS overrides');
    expect(text).not.toContain('AGENT_MAX_USD overrides');
    expect(text).not.toContain('AGENT_MAX_TURNS overrides');
  });

  test('should name the variable that replaced a role’s wall clock', () => {
    const text = describeBudget(line({ timeoutSeconds: 180, overrodeTimeout: true }));

    expect(text, 'the reader must be able to tell 180s from a role that asked for 180s').toContain(
      'AGENT_TIMEOUT_MS overrides the role’s 600s',
    );
    expect(text, 'and the enforced value is still printed').toContain('180s');
  });

  test('should name an overridden turn budget and an overridden spend scale', () => {
    const turns = describeBudget(line({ maxTurns: 40, overrodeTurns: true }));
    expect(turns).toContain('AGENT_MAX_TURNS overrides the role’s 20');
    expect(
      turns,
      'the role’s own number must not be presented as the limit in force',
    ).not.toContain('role asks');

    const usd = describeBudget(line({ maxUsd: 4, overrodeUsd: true }));
    expect(usd).toContain('AGENT_MAX_USD overrides the tier scale');
    expect(usd).toContain('$4.00');
  });

  test('should say when spend is measured rather than capped', () => {
    const text = describeBudget(line({ measuringSpendOnly: true }));

    expect(
      text,
      'a reference is not a ceiling, and the difference decides whether a run was stopped',
    ).toContain('spend MEASURED not capped (reference $1.00)');
  });
});

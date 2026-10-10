import { test, expect } from '@playwright/test';
import { fundsTheOpening, Budget, billableTokens } from '../../src/agents/budget.js';
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

  test('should declare that the inventory stopped at a frame rather than reporting a clean page', () => {
    const [issue] = auditTestability([], ['/embedded/checkout']);

    expect(
      issue?.kind,
      'silence about a boundary the inventory did not cross is a wrong answer stated confidently',
    ).toBe('unscanned-frame');
    // The wording narrowed on 2026-10-02, when `readFrames` started reading these documents. It
    // used to say the content was "unexamined", and that became false on the same report that
    // began listing what was inside — a blind spot claimed after it was closed is the mirror of
    // one claimed closed before it was, and both make the report untrustworthy. What is still
    // true, and what this now asserts, is narrower: the *inventory* stops here.
    expect(
      issue?.problem,
      'the finding must still refuse to imply the inventory covers the frame',
    ).toContain('stops at this frame');
    expect(issue?.problem, 'and must point at where the frame content actually is').toContain(
      'INSIDE THE FRAMES',
    );
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

test.describe('the only spend bound that can stop a run', () => {
  /**
   * **Proved by instrumenting the SDK stream on 2026-10-06**, not inferred: a run emitted
   * `system`, `assistant` and `rate_limit_event` messages and then exactly one
   * `result num_turns=1 cost=0.13895`. `client.ts` records cost only on that message, so for the
   * whole of a run `costUsd` is 0 and `worstTurnUsd` is 0 — the dollar limit is a post-mortem and
   * has never bounded anything, which is why `exploratory-tester` could spend an unmeasured amount
   * against a $1.00 limit and be stopped only by the wall clock.
   *
   * Token usage rides on every assistant message, so a ceiling on it fires while the run is still
   * going. These are the tests that the ceiling fires, and that it does not fire when absent.
   */

  test('should stop a run once the tokens are spent', () => {
    const budget = new Budget({
      maxTurns: 100,
      maxUsd: 1,
      timeoutMs: 600_000,
      maxTokens: 1_000,
    });

    budget.record({ tokens: 400 });
    expect(budget.exceeded(), 'under the ceiling, nothing to say').toBeNull();

    budget.record({ tokens: 700 });
    expect(
      budget.exceeded(),
      'and over it the run must end — this is the only spend-shaped limit that can',
    ).toContain('token limit reached');
  });

  test('should accumulate rather than replace, because usage arrives per message', () => {
    // `costUsd` is a running total the SDK reports once; tokens arrive in pieces. Assigning
    // instead of adding would leave the ceiling reading the last message only, so a run of a
    // thousand small messages would never reach any limit.
    const budget = new Budget({ maxTurns: 100, maxUsd: 1, timeoutMs: 600_000, maxTokens: 300 });
    for (let i = 0; i < 3; i += 1) budget.record({ tokens: 100 });

    expect(budget.spent().tokens, 'three messages of a hundred are three hundred').toBe(300);
    expect(budget.exceeded()).toContain('token limit reached');
  });

  test('should not bound a run that was given no ceiling', () => {
    // The honest default. A ceiling invented in `Budget` would bound every caller at once, which
    // is the mistake `.env.example` records against `AGENT_MAX_TURNS` — so absence means
    // unbounded, and the banner says so in words rather than printing a dollar figure that
    // enforces nothing.
    const budget = new Budget({ maxTurns: 100, maxUsd: 1, timeoutMs: 600_000 });
    budget.record({ tokens: 10_000_000 });

    expect(
      budget.exceeded(),
      'no ceiling was asked for, so none is enforced — and the line must not claim one',
    ).toBeNull();
  });

  test('should treat a ceiling of zero as no ceiling, not as a ceiling of nothing', () => {
    // `AGENT_MAX_TOKENS=` unset reads as 0, and a 0 ceiling would abort every run on its first
    // message while looking exactly like a limit that works.
    const budget = Budget.fromEnv({ maxTurns: 5, maxUsd: 1, timeoutMs: 600_000 });

    expect(
      budget.limits.maxTokens,
      'omitted rather than zeroed, or the first message of every run would end it',
    ).toBeUndefined();
  });

  test('should keep the dollar figure reporting even though it cannot bound', () => {
    // Still enforced *after* the fact, and still worth having: it is how a run says what it
    // actually cost. What changed is the claim made for it, not the arithmetic.
    const budget = new Budget({ maxTurns: 100, maxUsd: 1, timeoutMs: 600_000 });
    budget.record({ costUsd: 1.5 });

    expect(budget.exceeded()).toContain('spend limit reached');
  });

  test('should report tokens alongside cost, so the conversion can be re-derived', () => {
    // `TOKENS_PER_USD` in `models.ts` is one measurement. It stays checkable only while every
    // run prints both halves of the pair it was derived from.
    const budget = new Budget({ maxTurns: 100, maxUsd: 1, timeoutMs: 600_000 });
    budget.record({ tokens: 42_551 });
    budget.record({ costUsd: 0.175568 });

    const spent = budget.spent();
    expect(spent.tokens, 'the token half of the pair TOKENS_PER_USD was measured from').toBe(
      42_551,
    );
    expect(
      spent.costUsd,
      'and the dollar half — without both, that constant stops being checkable',
    ).toBeCloseTo(0.175568, 6);
  });
});

test.describe('what a message actually cost, in input-token-equivalents', () => {
  /**
   * **These exist because a poison test walked through the summation untouched.** Zeroing the
   * cache-creation term left all thirty-six tests green: they exercise `Budget`, while the
   * arithmetic lived inline in a `for await` over the SDK stream where nothing could reach it.
   * That term carries almost the entire count, so zeroing it makes the ceiling never fire — and a
   * limit that silently never fires is worse than none, because the banner claims it is there.
   */

  test('should count the cache tokens that carry almost the whole bill', () => {
    // The shape measured on 2026-10-06, verbatim: cache creation dominates by three orders of
    // magnitude. A count that leaves it out reads as 4 instead of 42,555.
    expect(
      billableTokens({
        input_tokens: 2,
        output_tokens: 2,
        cache_creation_input_tokens: 42_551,
        cache_read_input_tokens: 0,
      }),
      'a one-hour cache write costs twice an input token, and it is the term the ceiling depends on',
    ).toBe(85_114);
  });

  test('should count a cache read, which a warm prompt is almost entirely made of', () => {
    expect(
      billableTokens({
        input_tokens: 5,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 30_000,
      }),
      'a cache read is a tenth of an input token — counting it as a write overstates twentyfold ' +
        'and compounds every message, which took two live runs to zero actions',
    ).toBe(3_055);
  });

  test('should survive the nulls the API actually sends', () => {
    // Two of the four are `number | null`, and a run with no cache writes sends null rather than
    // omitting the field. `null + 5` is 5, but `undefined + 5` is NaN — and NaN exceeds no
    // ceiling, so the bound would vanish on exactly the runs that have no cache.
    const counted = billableTokens({
      input_tokens: 7,
      output_tokens: 3,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    });

    expect(Number.isNaN(counted), 'a NaN total is an absent ceiling').toBe(false);
    expect(counted, '7 input at 1x and 3 output at 5x').toBe(22);
  });

  test('should charge an unsplit cache write at the dearer rate', () => {
    // The API reports a 5m/1h split when it has one. Without it, guessing the cheaper rate
    // would understate the very cost this bound exists to hold.
    expect(
      billableTokens({ cache_creation_input_tokens: 1_000 }),
      'no split given, so charged as a one-hour write rather than assumed cheap',
    ).toBe(2_000);
  });

  test('should use the split when the API reports one', () => {
    expect(
      billableTokens({
        cache_creation_input_tokens: 1_000,
        cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 0 },
      }),
      'a five-minute write is 1.25x, not 2x — the split is worth reading',
    ).toBe(1_250);
  });

  test('should treat a missing field as nothing rather than as NaN', () => {
    expect(billableTokens({ input_tokens: 4 }), 'the shape can change under us').toBe(4);
    expect(billableTokens({}), 'and an empty usage is zero, not NaN').toBe(0);
  });
});

test.describe('how much of a run is left', () => {
  test('should report the tightest bound, not the roomiest', () => {
    // A run with hours of clock and a spent token ceiling is as finished as one with the reverse.
    // Reporting whichever looks healthiest would be reassurance in the one place it costs most.
    const budget = new Budget({
      maxTurns: 100,
      maxUsd: 1,
      timeoutMs: 3_600_000,
      maxTokens: 1_000,
    });
    budget.record({ tokens: 900 });

    const left = budget.remaining();
    expect(left?.tightest, 'tokens are nearly gone while the clock has an hour on it').toBe(
      'tokens',
    );
    expect(left?.fraction, 'a tenth of the ceiling left').toBeCloseTo(0.1, 2);
  });

  test('should be null when nothing bounds the run', () => {
    /**
     * "No limit set" and "plenty left" are different facts and only one of them means the run is
     * safe. Collapsing them would let a session with no spend bound at all read as comfortable —
     * which is the state every run was in before 2026-10-06.
     */
    const budget = new Budget({ maxTurns: 0, maxUsd: 1, timeoutMs: 0 });
    expect(budget.remaining(), 'nothing is bounded, so there is no fraction to report').toBeNull();
  });

  test('should not read an unticked turn counter as a full budget', () => {
    // `num_turns` arrives only with the final result message, so `turns` is 0 for the whole of a
    // run. A fraction built from it would report 100% of the turn budget remaining at the moment
    // the run ends, which is worse than saying nothing.
    const budget = new Budget({ maxTurns: 10, maxUsd: 1, timeoutMs: 0 });
    expect(
      budget.remaining(),
      'turns cannot be watched mid-run, so they are not offered as a reading',
    ).toBeNull();
  });

  test('should fall to zero rather than go negative', () => {
    const budget = new Budget({ maxTurns: 0, maxUsd: 1, timeoutMs: 0, maxTokens: 100 });
    budget.record({ tokens: 250 });

    expect(budget.remaining()?.fraction, 'overspent is spent').toBeLessThanOrEqual(0);
  });
});

test.describe('whether a ceiling can fund the run it is bounding', () => {
  /**
   * Measured harm, 2026-10-09: a run capped at `AGENT_MAX_USD=0.9` (436,313 weighted units) died
   * at 29 seconds having completed **zero turns and four tool calls**, reporting 444,046/436,313.
   * The worktree was created, the browser launched and the money spent, and nothing had said the
   * ceiling could not fund the first message — the header printed it as a token count and nothing
   * compared it with the prompt.
   *
   * The cause is the shape of the cost curve: the first message *writes* the prompt to cache at
   * 1.25–2×, where later messages re-read it at 0.1×. A ceiling multiplied from the ~21,262 figure
   * for a steady-state message is therefore right for a long run and silently fatal for a short
   * one. Item 91.
   */

  // Four characters per token, cheaper cache-write rate: 1.25 weighted units per 4 characters.
  const charsFor = (weighted: number): number => Math.round((weighted / 1.25) * 4);

  test('should refuse a ceiling the opening prompt exhausts on its own', () => {
    const verdict = fundsTheOpening(charsFor(500_000), 436_313);

    expect(verdict.verdict, 'nothing can be bought with what is left').toBe('fatal');
    expect(verdict.message, 'and it has to say what to change').toContain('--skills');
    expect(verdict.message, 'with the numbers that decided it').toContain('436,313');
  });

  test('should refuse the ceiling that was measured failing', () => {
    /**
     * The case from the live run rather than a constructed one. `exploratory-tester` with one
     * skill composes a 42,739-character prompt, and `AGENT_MAX_USD=0.05` sets a 24,240-unit
     * ceiling. That run reached **45,369/24,240 in 12 seconds with zero turns**, and before this
     * check the only notice was the stop reason afterwards — the worktree built, the browser
     * launched, the scan run.
     */
    const verdict = fundsTheOpening(42_739, 24_240);

    expect(verdict.verdict, 'this exact pair is known to produce nothing').toBe('fatal');
    expect(
      verdict.message,
      'and the refusal shows the prompt’s share of its own estimate',
    ).toContain('13,356');
  });

  test('should warn when the prompt takes over half before the session acts', () => {
    const verdict = fundsTheOpening(charsFor(300_000), 436_313);

    expect(verdict.verdict).toBe('tight');
    expect(
      verdict.message,
      'and name the consequence for the warning that depends on a fraction',
    ).toContain('wrap-up');
  });

  test('should stay silent about a ceiling that comfortably funds the run', () => {
    const verdict = fundsTheOpening(charsFor(400_000), 21_815_640);

    expect(verdict.verdict, 'the $45 ceiling against a real prompt').toBe('funded');
    expect(verdict.message, 'a check that passes says nothing').toBeNull();
  });

  test('should not invent a bound where none was set', () => {
    /**
     * `maxTokens` is absent when nothing names a token ceiling, and zero is treated the same way
     * by `tokenCeiling`. Reporting either as fatal would refuse every unbounded run — the runs
     * that are bounded by the clock instead.
     */
    expect(fundsTheOpening(4_000_000, undefined).verdict).toBe('unbounded');
    expect(fundsTheOpening(4_000_000, 0).verdict, 'zero means unbounded here, not empty').toBe(
      'unbounded',
    );
  });
});

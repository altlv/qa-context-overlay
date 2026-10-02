import { test, expect } from '@playwright/test';
import { EFFECT_TAGS } from '../../apps/app-config.js';
import { PROBES, boundaryValues, lengthBoundaries } from '../../src/fixtures/probes.js';
import {
  display,
  formatIdeas,
  ideasFor,
  readBackFor,
  type IdeaTag,
} from '../../src/qe/test-ideas.js';
import type { PageScan, ScannedElement } from '../../src/tools/page-scanner.js';
import type { EndpointShape } from '../../src/tools/schema.js';

/**
 * `npm run ideas` turns a saved scan into cases a coder writes instead of deriving. A
 * wrong value here is written into a spec verbatim, so the arithmetic is tested
 * directly, and so is every case where the generator must print nothing.
 */

const base: NonNullable<ScannedElement['constraints']> = {
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
};

const el = (over: Partial<ScannedElement> & { c?: Partial<typeof base> } = {}): ScannedElement => {
  const { c, ...rest } = over;
  return {
    tag: 'input',
    type: 'text',
    role: null,
    accessibleName: 'Field',
    testId: null,
    affordance: 'input',
    suggested: "getByLabel('Field')",
    unique: true,
    stability: 'text-dependent',
    constraints: { ...base, ...c },
    stateAttributes: {},
    formIndex: 0,
    blocker: null,
    ...rest,
  };
};

const submit = (over: Partial<ScannedElement> = {}) =>
  el({
    tag: 'button',
    type: 'submit',
    affordance: 'submit',
    constraints: null,
    suggested: "getByRole('button', { name: 'Save' })",
    ...over,
  });

const scan = (interactive: ScannedElement[]): PageScan => ({
  url: 'http://local',
  title: 't',
  scannedAt: '2026-09-14T00:00:00.000Z',
  counts: {
    interactive: interactive.length,
    inputs: 0,
    submits: 0,
    stateful: 0,
    blocked: 0,
    withTestId: 0,
    forms: 0,
    tables: 0,
  },
  frames: [],
  shadowHosts: [],
  interactive,
  endpoints: [],
  testability: [],
  insideFrames: [],
  aria: { widgetsMissedBySelectors: [], announcing: [], unreadable: 0 },
});

const endpoint = (method: string, template: string, over: Partial<EndpointShape> = {}) => ({
  method,
  template,
  examples: [template],
  statuses: [200],
  calls: 1,
  request: [],
  response: [],
  ...over,
});

const ideas = (elements: ScannedElement[], dictionary: EndpointShape[] = []) =>
  ideasFor({ scan: scan(elements), dictionary });

const byHeuristic = (result: ReturnType<typeof ideasFor>, id: string) =>
  result.ideas.filter((idea) => idea.heuristic === id);

test.describe('boundary arithmetic', () => {
  test('should give below, at and above each end of a declared range', () => {
    expect(
      boundaryValues('1', '10'),
      'one off at either end is where the off-by-one lives',
    ).toEqual(['0', '1', '2', '9', '10', '11']);
  });

  test('should step by the declared step, not by one', () => {
    // 9 against min=10 step=5 is refused for breaking the step, not the bound.
    expect(boundaryValues('10', null, '5')).toEqual(['5', '10', '15']);
  });

  test('should not print float noise into a spec', () => {
    expect(boundaryValues('0.1', null, '0.2')).toEqual(['-0.1', '0.1', '0.3']);
  });

  test('should produce nothing when no bound is declared or a bound is not a number', () => {
    expect(boundaryValues(null, null)).toEqual([]);
    expect(boundaryValues('abc', ''), 'an unparseable bound must not become NaN in a spec').toEqual(
      [],
    );
  });

  test('should give lengths one under, at and one over, never negative', () => {
    expect(lengthBoundaries(3)).toEqual(['xx', 'xxx', 'xxxx']);
    expect(lengthBoundaries(0)).toEqual(['', 'x']);
  });
});

test.describe('ideas from fields', () => {
  test('should turn a declared range into boundary values', () => {
    const [boundary] = byHeuristic(
      ideas([el({ type: 'number', c: { min: '1', max: '10' } })]),
      'boundary-numeric',
    );
    expect(boundary?.values, 'the scan declared the range; the values must follow from it').toEqual(
      ['0', '1', '2', '9', '10', '11'],
    );
  });

  test('should tag a field by whether its form submits', () => {
    const inForm = ideas([el({ c: { required: true } }), submit()]);
    const alone = ideas([el({ c: { required: true }, formIndex: null })]);
    expect(byHeuristic(inForm, 'partition-required')[0]?.tag).toBe('@writes');
    expect(
      byHeuristic(alone, 'partition-required')[0]?.tag,
      'a field nothing submits changes nothing on the server',
    ).toBe('@read-only');
  });

  test('should give an unbounded number field the numeric probes', () => {
    const [numeric] = byHeuristic(ideas([el({ type: 'number' })]), 'partition-unbounded-number');
    expect(numeric?.values).toEqual(PROBES.number.map(display));
    expect(numeric?.from, 'the spec should import the set, not copy it').toBe('PROBES.number');
  });

  test('should not generate probe values for a password field', () => {
    // Declared length and pattern on purpose: without them no other generator fires on
    // a password field, and the rule refusing it went untested — a mutation survived.
    const result = ideas([
      el({ type: 'password', c: { required: true, maxLength: 64, pattern: '.{8,}' } }),
    ]);
    expect(
      result.ideas.map((idea) => idea.heuristic),
      'credential attempts are local-only; a generator must not hand an agent a list of passwords to type',
    ).toEqual(['partition-required']);
    expect(result.notGenerated.join(' ')).toContain('password');
  });

  test('should sample a long option list rather than print all of it', () => {
    const options = Array.from({ length: 30 }, (_, index) => `option-${index}`);
    const [select] = byHeuristic(
      ideas([el({ tag: 'select', type: null, c: { options } })]),
      'partition-options',
    );
    expect(select?.values).toEqual(['"option-0"', '"option-15"', '"option-29"']);
    expect(select?.assert, 'a sample must say it is a sample').toContain('sample of 30');
  });

  test('should leave out a maxlength boundary on a field with no declared length', () => {
    const result = ideas([el({})]);
    expect(byHeuristic(result, 'boundary-length')).toEqual([]);
    expect(byHeuristic(result, 'partition-text')[0]?.values).toContain(display(PROBES.longText));
  });

  test('should generate nothing for a blocked control, and say so', () => {
    const result = ideas([el({ blocker: 'disabled', c: { required: true } })]);
    expect(result.ideas, 'a disabled or covered control cannot be acted on by any case').toEqual(
      [],
    );
    expect(result.notGenerated.join(' ')).toContain('blocked');
  });
});

test.describe('ideas from submits, selections and toggles', () => {
  test('should give every submit the write sequence', () => {
    const kinds = ideas([el({}), submit()]).ideas.map((idea) => idea.heuristic);
    for (const id of ['negative-set', 'double-submit', 'back-after-submit', 'reread-after-write']) {
      expect(
        kinds,
        `a submit control is a write; "${id}" is one of the cases every write gets`,
      ).toContain(id);
    }
  });

  test('should name the captured read a submit can be checked against', () => {
    const withData = endpoint('GET', '/api/todos', {
      response: [
        {
          path: 'todos',
          types: ['array'],
          nullable: false,
          optional: false,
          sample: null,
          seen: 1,
        },
      ],
    });
    const [reread] = byHeuristic(ideas([submit()], [withData]), 'reread-after-write');
    expect(reread?.values).toEqual(['GET /api/todos']);
  });

  test('should not offer a bodiless GET as the read that proves a write', () => {
    // The first real run offered the-internet's analytics beacon, GET /event, as the
    // read to check a login against. It returns nothing, so it can prove nothing.
    const [reread] = byHeuristic(
      ideas([submit()], [endpoint('GET', '/event')]),
      'reread-after-write',
    );
    expect(reread?.values, 'a beacon is not a read-back').toEqual([]);
  });

  test('should leave every idea in a login form untagged, so it runs on local only', () => {
    const login = ideas([el({ c: { required: true } }), el({ type: 'password' }), submit()]);
    const tagged = login.ideas.filter((idea) => idea.tag !== null).map((idea) => idea.heuristic);
    expect(
      tagged,
      'probing a login form and submitting is a credential attempt; tagged, it would run against a shared environment and lock accounts',
    ).toEqual([]);
    expect(login.ideas[0]?.untagged).toContain('credential attempt');
  });

  test('should print a case once when controls share a selector', () => {
    const box = () =>
      el({
        type: 'checkbox',
        affordance: 'toggle',
        suggested: "locator('input')",
        unique: false,
        stateAttributes: { checked: 'false' },
      });
    const repeats = byHeuristic(ideas([box(), box()]), 'repeat-transition');
    expect(repeats, 'the same case twice adds reading and nothing else').toHaveLength(1);
  });

  test('should treat two checkboxes in one form as a selection', () => {
    const box = (checked: string) =>
      el({ type: 'checkbox', affordance: 'toggle', stateAttributes: { checked } });
    const [selection] = byHeuristic(ideas([box('false'), box('true')]), 'selection-none-some-all');
    expect(selection?.values).toEqual(['none', 'exactly one', 'all']);
  });

  test('should size pairwise only once there are three parameters', () => {
    const select = (count: number) =>
      el({
        tag: 'select',
        type: null,
        c: { options: Array.from({ length: count }, (_, i) => `${i}`) },
      });
    expect(byHeuristic(ideas([select(3), select(4)]), 'pairwise-sizing')).toEqual([]);
    const [sizing] = byHeuristic(ideas([select(3), select(4), select(5)]), 'pairwise-sizing');
    expect(
      sizing?.values,
      'exhaustive is the product; pairwise cannot be below the two largest multiplied',
    ).toEqual(['exhaustive 60', 'pairwise at least 20']);
  });

  test('should only generate a repeat-transition case for a toggle that exposes state', () => {
    const withState = el({
      affordance: 'toggle',
      type: 'button',
      stateAttributes: { 'aria-pressed': 'false' },
    });
    const without = el({ affordance: 'toggle', type: 'button', stateAttributes: {} });
    expect(byHeuristic(ideas([withState]), 'repeat-transition')).toHaveLength(1);
    const blind = ideas([without]);
    expect(
      byHeuristic(blind, 'repeat-transition'),
      'a toggle with no state gives the third press nothing to assert',
    ).toEqual([]);
    expect(blind.notGenerated.join(' ')).toContain('expose no state');
  });
});

test.describe('ideas from captured traffic', () => {
  test('should find the read back for a write on the same resource or its collection', () => {
    const body = {
      response: [
        {
          path: 'id',
          types: ['number' as const],
          nullable: false,
          optional: false,
          sample: '1',
          seen: 1,
        },
      ],
    };
    const dictionary = [
      endpoint('GET', '/api/todos', body),
      endpoint('GET', '/api/books/{id}', body),
    ];
    expect(readBackFor(endpoint('POST', '/api/todos'), dictionary)?.template).toBe('/api/todos');
    expect(readBackFor(endpoint('PUT', '/api/books/{id}'), dictionary)?.template).toBe(
      '/api/books/{id}',
    );
    expect(readBackFor(endpoint('DELETE', '/api/authors/{id}'), dictionary)).toBeNull();
  });

  test('should say persistence cannot be proven when no read was captured', () => {
    const [reread] = byHeuristic(ideas([], [endpoint('POST', '/api/todos')]), 'reread-after-write');
    expect(
      reread?.assert,
      'an absent read must be stated, not papered over with a response check',
    ).toContain('cannot be proven');
  });

  test('should derive the negative set from the fields a write actually sent', () => {
    const write = endpoint('POST', '/api/todos', {
      request: [
        {
          path: 'title',
          types: ['string'],
          nullable: false,
          optional: false,
          sample: 'x',
          seen: 1,
        },
        {
          path: 'done',
          types: ['boolean'],
          nullable: false,
          optional: false,
          sample: 'false',
          seen: 1,
        },
      ],
    });
    const [negative] = byHeuristic(ideas([], [write]), 'negative-set');
    expect(negative?.values).toEqual(
      expect.arrayContaining(['omit "title"', '"title": 123', '"done": "yes"', '{}']),
    );
  });

  test('should say when no write was captured at all', () => {
    expect(ideas([el({})]).notGenerated.join(' ')).toContain('no write was captured');
  });
});

test.describe('what the output promises', () => {
  test('should refuse to generate from a scan in the old format', () => {
    const old = scan([{ ...el({}), affordance: undefined as unknown as 'input' }]);
    const result = ideasFor({ scan: old, dictionary: [] });
    expect(
      result.ideas,
      'an old scan has no constraints; generating from it prints a thin list that looks complete',
    ).toEqual([]);
    expect(result.notGenerated.join(' ')).toContain('re-run');
  });

  test('should use tags the effect-tag policy actually recognises', () => {
    const tags: IdeaTag[] = ['@read-only', '@writes'];
    const known = Object.values(EFFECT_TAGS) as string[];
    for (const tag of tags) {
      expect(
        known,
        `"${tag}" would never match the policy grep, so the test would run nowhere but local`,
      ).toContain(tag);
    }
  });

  test('should print a long repeated value as the expression that makes it', () => {
    expect(
      display('x'.repeat(1001)),
      'a thousand x characters in the terminal hides every other value on the line',
    ).toBe('"x".repeat(1001)');
    expect(display(PROBES.email[2])).toBe('"x".repeat(100) + "@test.com"');
    expect(display("O'Brien")).toBe('"O\'Brien"');
  });

  test('should end with what stays gated and what stays judgement', () => {
    const text = formatIdeas(ideas([el({}), submit()]), 'scan.json');
    expect(text, 'a coder must see which gates will refuse the spec before writing it').toContain(
      'write-not-read-back',
    );
    expect(text, 'the generated list must not read as everything there is to do').toContain(
      'Still yours — judgement no script makes',
    );
  });
});

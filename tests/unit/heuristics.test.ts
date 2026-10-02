import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEURISTICS, formatCatalogue, gated, inMode } from '../../src/qe/heuristics.js';
import { ideasFor } from '../../src/qe/test-ideas.js';
import type { PageScan, ScannedElement } from '../../src/tools/page-scanner.js';
import type { EndpointShape } from '../../src/tools/schema.js';

/**
 * The catalogue sorts heuristics into scripted, generated, scriptable and judgement.
 * It is only worth reading while it tells the truth about the code: a command that
 * exists, a skill that exists, and a generator behind every entry that claims one.
 */

interface PackageJson {
  scripts?: Record<string, string>;
}

const scripts = new Set(
  Object.keys((JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson).scripts ?? {}),
);

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

const constraints = (over: Partial<NonNullable<ScannedElement['constraints']>>) => ({
  ...(element({}).constraints as NonNullable<ScannedElement['constraints']>),
  ...over,
});

/** One page carrying every shape a generator reads, so every generator has to fire. */
function everything(): { scan: PageScan; dictionary: EndpointShape[] } {
  const interactive = [
    element({ constraints: constraints({ min: '1', max: '10', required: true }), type: 'number' }),
    element({ type: 'number', suggested: "getByLabel('Unbounded')" }),
    element({ constraints: constraints({ maxLength: 20, pattern: '[a-z]+' }) }),
    element({ suggested: "getByLabel('Notes')" }),
    element({ tag: 'select', type: null, constraints: constraints({ options: ['', 'a', 'b'] }) }),
    element({ type: 'checkbox', affordance: 'toggle', stateAttributes: { checked: 'false' } }),
    element({ type: 'checkbox', affordance: 'toggle', stateAttributes: { checked: 'true' } }),
    element({ type: 'submit', tag: 'button', affordance: 'submit', constraints: null }),
  ];
  const scan = {
    url: 'http://local',
    title: 't',
    scannedAt: '2026-09-14T00:00:00.000Z',
    counts: {
      interactive: interactive.length,
      inputs: 5,
      submits: 1,
      stateful: 2,
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
    insideFrames: [],
    aria: { widgetsMissedBySelectors: [], announcing: [], unreadable: 0 },
  } satisfies PageScan;
  const endpoint = (method: string, template: string): EndpointShape => ({
    method,
    template,
    examples: [template],
    statuses: [200],
    calls: 1,
    request: [],
    response: [],
  });
  return { scan, dictionary: [endpoint('GET', '/api/items'), endpoint('POST', '/api/items')] };
}

test.describe('the heuristics catalogue', () => {
  test('should name only skills that exist', () => {
    const missing = HEURISTICS.filter(
      (entry) => !existsSync(join('.claude', 'skills', entry.skill, 'SKILL.md')),
    ).map((entry) => `${entry.id} → ${entry.skill}`);
    expect(missing, 'a heuristic attributed to a skill nobody can load').toEqual([]);
  });

  test('should give every entry a unique id', () => {
    const ids = HEURISTICS.map((entry) => entry.id);
    expect(new Set(ids).size, 'two entries share an id, so one is unreachable').toBe(ids.length);
  });

  test('should name a real command for everything scripted or generated, and none otherwise', () => {
    for (const entry of HEURISTICS) {
      const doing = entry.mode === 'scripted' || entry.mode === 'generated';
      expect(
        entry.by !== null,
        `"${entry.id}" is ${entry.mode} — ${doing ? 'it must name the command that does it' : 'nothing does it yet, so it must not name a command'}`,
      ).toBe(doing);
      const command = /npm run ([\w:-]+)/.exec(entry.by ?? '')?.[1];
      if (command !== undefined) {
        expect(scripts.has(command), `"${entry.id}" sends an agent to npm run ${command}`).toBe(
          true,
        );
      }
    }
  });

  test('should say why for every entry, above all the judgement ones', () => {
    const silent = HEURISTICS.filter((entry) => entry.why.trim().length < 20).map((e) => e.id);
    expect(
      silent,
      'a judgement entry without a reason reads as "not got round to scripting it"',
    ).toEqual([]);
  });

  test('should have a generator behind every generated entry, and generate nothing uncatalogued', () => {
    const emitted = new Set(ideasFor(everything()).ideas.map((idea) => idea.heuristic));
    const claimed = inMode('generated').map((entry) => entry.id);

    const unbacked = claimed.filter((id) => !emitted.has(id));
    expect(unbacked, 'the catalogue promises cases that `npm run ideas` never prints').toEqual([]);

    const generatedIds = new Set(claimed);
    const stray = [...emitted].filter((id) => !generatedIds.has(id));
    expect(stray, 'a generator emits an id the catalogue does not list as generated').toEqual([]);
  });

  test('should keep judgement in the catalogue rather than scripting everything', () => {
    // The point of the split. A catalogue with no judgement entries has either
    // scripted the decisions that must stay with a person or stopped listing them.
    expect(
      inMode('judgement').length,
      'the judgement entries are what keeps a script from deciding what matters',
    ).toBeGreaterThan(5);
    expect(formatCatalogue()).toContain('Judgement — stays with whoever does the work');
  });

  test('should only gate entries that something produces', () => {
    for (const entry of gated()) {
      expect(
        entry.mode === 'scripted' || entry.mode === 'generated',
        `"${entry.id}" is gated but ${entry.mode} — a gate over work nothing produces refuses specs for a reason nobody can act on`,
      ).toBe(true);
    }
  });
});

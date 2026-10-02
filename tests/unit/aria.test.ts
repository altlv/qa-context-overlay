import { test, expect } from '@playwright/test';
import {
  ariaLocator,
  parseAriaSnapshot,
  selectorBlindSpots,
  WIDGET_ROLES,
  ANNOUNCEMENT_ROLES,
  type AriaNode,
} from '../../src/tools/aria.js';

/**
 * The parser is pure, so it is tested from captured snapshots rather than a browser. Every
 * fixture below is real `ariaSnapshot()` output, taken from Playwright 1.63 on 2026-10-02 —
 * invented grammar would test the parser against my memory of the format, which is the same
 * mistake as writing a mutation set after reading the tests.
 */

const REAL = `- link "Cart":
  - /url: /cart
- checkbox "Agree" [checked]
- text: Agree
- textbox "Email"
- combobox:
  - option "One"
  - option "Two" [selected]
- button "Pay" [disabled]
- tablist:
  - tab "First" [selected]
- textbox "Notes"
- slider "Volume"
- button "Custom": x
- status: Saved`;

test.describe('reading an accessibility snapshot', () => {
  const { nodes, unparsed } = parseAriaSnapshot(REAL);
  const roleOf = (role: string): AriaNode[] => nodes.filter((node) => node.role === role);

  test('should read every node and understand every line', () => {
    expect(unparsed, 'a parser that drops what it cannot read reports a simpler page').toBe(0);
    expect(
      nodes.map((node) => node.role),
      'twelve nodes: the text node and the /url property are not nodes',
    ).toEqual([
      'link',
      'checkbox',
      'textbox',
      'combobox',
      'option',
      'option',
      'button',
      'tablist',
      'tab',
      'textbox',
      'slider',
      'button',
      'status',
    ]);
  });

  test('should keep the name the browser computed', () => {
    expect(roleOf('slider')[0]?.name, 'aria-label becomes the accessible name').toBe('Volume');
    expect(roleOf('combobox')[0]?.name, 'and a select with no label has none').toBeNull();
  });

  test('should keep state flags apart from the name', () => {
    expect(roleOf('checkbox')[0]?.states).toEqual(['checked']);
    expect(roleOf('checkbox')[0]?.name, 'the flag must not leak into the name').toBe('Agree');
    expect(nodes.find((node) => node.role === 'button' && node.name === 'Pay')?.states).toEqual([
      'disabled',
    ]);
  });

  test('should record depth so a child widget is distinguishable from a loose one', () => {
    // A tab inside a tablist and a tab on its own are different situations, and a flat list
    // that lost the nesting could not tell them apart.
    expect(roleOf('tablist')[0]?.depth).toBe(0);
    expect(roleOf('tab')[0]?.depth, 'nested one level under its tablist').toBe(1);
  });

  test('should separate inline text from the accessible name', () => {
    const custom = nodes.find((node) => node.name === 'Custom');
    expect(custom?.role, 'a custom element carrying role=button is a button to the browser').toBe(
      'button',
    );
    expect(custom?.text, 'its content is kept, and is not its name').toBe('x');
  });

  test('should read a node YAML had to quote', () => {
    /**
     * Captured from polymer-shop, 2026-10-02. A name containing a colon and a space makes the
     * snapshot single-quote the whole node, because `link "Shopping cart: 0 items":` would read
     * as a mapping key. The first version of this parser required a leading letter and dropped
     * both lines — so the storefront appeared to have no cart, and only the `unparsed` counter
     * said otherwise.
     */
    const { nodes, unparsed } = parseAriaSnapshot(
      `- 'link "Shopping cart: 0 items"':\n` +
        `  - /url: /cart\n` +
        `  - 'button "Shopping cart: 0 items"':\n` +
        `    - img`,
    );
    expect(unparsed, 'the quoted form is part of the grammar, not a parse failure').toBe(0);
    expect(nodes.map((node) => [node.role, node.name])).toEqual([
      ['link', 'Shopping cart: 0 items'],
      ['button', 'Shopping cart: 0 items'],
      ['img', null],
    ]);
  });

  test("should keep a literal quote inside a quoted node's name", () => {
    // YAML escapes one as two. Getting this wrong truncates the name, and the name is half of
    // the join `selectorBlindSpots` makes between the two sources.
    const { nodes } = parseAriaSnapshot(`- 'button "Men''s Outerwear: shop"':`);
    expect(nodes[0]?.name).toBe(`Men's Outerwear: shop`);
  });

  test('should count a line it cannot read rather than discarding it', () => {
    const { nodes: read, unparsed: bad } = parseAriaSnapshot('- button "Fine"\n- !!! nonsense');
    expect(read, 'the readable node still comes through').toHaveLength(1);
    expect(bad, 'and the unreadable one is counted, never silently dropped').toBe(1);
  });
});

test.describe('the role sets', () => {
  test('should treat the roles a selector list misses as widgets', () => {
    // The four measured as invisible to the twelve CSS selectors on 2026-10-02.
    for (const role of ['option', 'combobox', 'slider', 'tab']) {
      expect(WIDGET_ROLES.has(role), `${role} is a widget the selector sweep cannot see`).toBe(
        true,
      );
    }
  });

  test('should not pretend to see an aria-live region that carries no role', () => {
    /**
     * Captured 2026-10-02: `<div aria-live="polite">Saved automatically</div>` renders as
     * `- text: Saved automatically`. No role, and no `live` state flag — `ariaSnapshot()` emits
     * none, so the first version of `readAria` checked for one in a branch that could never
     * fire. A check that cannot fail reads as coverage, which is worse than its absence.
     *
     * Pinned so nobody concludes the accessibility tree closed the text blindness. It dented it.
     */
    const { nodes } = parseAriaSnapshot('- text: Saved automatically\n- status: Explicit status');
    expect(
      nodes.map((node) => node.role),
      'the role-bearing status survives; the bare live region is not a node at all',
    ).toEqual(['status']);
  });

  test('should keep announcements out of the widget set', () => {
    // A session reads these rather than operating them, and conflating the two would send a
    // role clicking at an error message.
    for (const role of ['status', 'alert', 'log']) {
      expect(ANNOUNCEMENT_ROLES.has(role)).toBe(true);
      expect(WIDGET_ROLES.has(role), `${role} is not something to operate`).toBe(false);
    }
  });
});

test.describe('what one source has and the other lacks', () => {
  const widgets: AriaNode[] = [
    { role: 'button', name: 'Pay', states: [], text: null, depth: 0 },
    { role: 'option', name: 'One', states: [], text: null, depth: 1 },
    { role: 'slider', name: 'Volume', states: [], text: null, depth: 0 },
  ];

  test('should report only the widgets the sweep did not find', () => {
    const missed = selectorBlindSpots([{ role: 'button', name: 'Pay' }], widgets);
    expect(
      missed.map((node) => node.role),
      'the button was found by both; the option and the slider by neither',
    ).toEqual(['option', 'slider']);
  });

  test('should match regardless of case and surrounding space', () => {
    // Two sources computing a name independently will differ in trivia. Treating that as a
    // blind spot would fill the report with noise and bury the real gaps.
    const missed = selectorBlindSpots(
      [
        { role: 'BUTTON', name: ' Pay ' },
        { role: 'option', name: 'One' },
        { role: 'slider', name: 'Volume' },
      ],
      widgets,
    );
    expect(missed, 'trivial disagreement is not a finding').toEqual([]);
  });

  test('should prefer understating a gap to inventing one', () => {
    // Role and name is the only join available across two sources that share no handle, so two
    // genuinely different controls with the same role and name pair as one. That makes the gap
    // read smaller than it is, which is the safer direction and is stated rather than hidden.
    const two: AriaNode[] = [
      { role: 'button', name: 'Delete', states: [], text: null, depth: 0 },
      { role: 'button', name: 'Delete', states: [], text: null, depth: 0 },
    ];
    expect(selectorBlindSpots([{ role: 'button', name: 'Delete' }], two)).toEqual([]);
  });
});

test('a locator for an aria node should say what it is worth', () => {
  expect(ariaLocator({ role: 'option', name: 'One', states: [], text: null, depth: 0 })).toBe(
    `getByRole('option', { name: "One" })`,
  );
  expect(
    ariaLocator({ role: 'combobox', name: null, states: [], text: null, depth: 0 }),
    'a nameless widget still gets a usable locator rather than none',
  ).toBe(`getByRole('combobox')`);
});

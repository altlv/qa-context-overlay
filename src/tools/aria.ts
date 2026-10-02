import type { Page } from '@playwright/test';

/**
 * The accessibility tree as a **second** source of what is on the page.
 *
 * The first source is `harvestCandidates`: twelve CSS selectors swept through open shadow
 * roots. Measured against three live subjects on 2026-10-02 it is in better shape than it
 * looked — it pierces shadow DOM, returns rich fingerprints on a Web Components storefront,
 * and missed nothing plainly interactive on a plain static page. It is kept, because it is
 * what produces a selector path an agent can heal and re-use.
 *
 * What it cannot do is decide what counts as a control by anything other than the twelve
 * names. `role=option`, `role=combobox`, `role=slider` and a custom element carrying
 * `role=button` are all standard, all interactive, and none are in the list. And the state
 * model is built only from controls, so a surface made of text — an error banner, a toast, a
 * validation message — is not a change it can perceive at all.
 *
 * This module adds the browser's own answer to both questions, and adds nothing of its own:
 *
 * - **Roles are computed by the browser**, to the ARIA spec, rather than inferred from a tag.
 *   Where a decision about which roles are *interactive* is still needed, the set below is
 *   the spec's widget roles — enumerable and citable, which a hand-picked selector list is
 *   not. That is the whole claim: not that a list has been avoided, but that the list is now
 *   someone else's standard rather than our guess.
 * - **Announcements with a role are in the tree.** `role=status`, `role=alert` and the rest
 *   appear, which is a dent in the one blindness the measurements confirmed outright. Only a
 *   dent: `aria-live` on an element with no role is **not** in the tree — it renders as a bare
 *   text node — so a text projection is still owed.
 *
 * It does not supersede the selector sweep and is not sufficient alone. A `<summary>` shows
 * as a `group`, a focusable `div` with no role shows as `text`, and a canvas app shows
 * whatever its author chose to publish — nothing, usually. Two sources disagreeing is the
 * useful state: what one has and the other lacks is a question worth printing, which is what
 * `selectorBlindSpots` returns.
 */

/**
 * ARIA widget roles — the things a user operates.
 *
 * Taken from the WAI-ARIA role taxonomy's widget category rather than chosen, so the reason
 * any role is here can be looked up instead of argued about. Composite widget roles
 * (`combobox`, `grid`, `listbox`, `menu`, `radiogroup`, `tablist`, `tree`) are included
 * because a session can operate the composite itself, not only its children.
 */
export const WIDGET_ROLES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'combobox',
  'gridcell',
  'link',
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'progressbar',
  'radio',
  'radiogroup',
  'scrollbar',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'textbox',
  'tree',
  'treegrid',
  'treeitem',
]);

/**
 * Roles whose job is to say something to the user.
 *
 * Separate from widgets on purpose. A session does not operate these; it **reads** them, and
 * they are where a large share of real defects surface — a wrong error, a missing
 * confirmation, a stale count. Nothing in the harness has been able to see one until now.
 */
export const ANNOUNCEMENT_ROLES: ReadonlySet<string> = new Set([
  'alert',
  'alertdialog',
  'log',
  'marquee',
  'status',
  'timer',
]);

export interface AriaNode {
  /** The role the browser computed, never one inferred here. */
  role: string;
  /** The accessible name, computed by the browser. Null when the node has none. */
  name: string | null;
  /** State flags the snapshot carried: `checked`, `disabled`, `selected`, `expanded`, … */
  states: string[];
  /** Inline text content, where the snapshot put any after the role. */
  text: string | null;
  /** Indentation depth, so a caller can tell a tab inside a tablist from a loose one. */
  depth: number;
}

const LINE = /^(\s*)-\s+(.*)$/;
/** `role "name" [state] [state]:` or `role: text` or `role:` or `text: …` or `/url: …`. */
const NODE = /^([A-Za-z][\w-]*)\s*(?:"((?:[^"\\]|\\.)*)")?\s*((?:\[[^\]]*\]\s*)*)(?::\s*(.*))?$/;

/**
 * YAML's single-quoted form, which the snapshot uses when a node would otherwise be ambiguous.
 *
 * A name containing a colon and a space does it: polymer-shop's cart emits
 * `- 'link "Shopping cart: 0 items"':`, because `link "Shopping cart: 0 items":` would read as
 * a mapping key. Without this the line matches nothing and the two cart controls — the ones a
 * session most wants on a storefront — are dropped.
 *
 * Found by the `unparsed` counter on the first live page it met, which is the only reason it is
 * here: a parser that had silently discarded them would have reported polymer-shop as having no
 * cart and nothing would have contradicted it. `''` is YAML's escape for a literal quote.
 */
function unquote(body: string): string {
  if (!body.startsWith("'")) return body;
  const end = body.lastIndexOf("'");
  if (end <= 0) return body;
  return body.slice(1, end).replace(/''/g, "'") + body.slice(end + 1);
}

/**
 * One `ariaSnapshot()` document as a flat list of nodes.
 *
 * Property lines (`/url: /cart`) and bare text nodes are dropped: the first belongs to the
 * node above it and the second is page copy rather than structure. A line this cannot parse
 * is dropped too — and `unparsed` counts them, because a parser that silently discards what
 * it does not understand would report a page as simpler than it is, which is the failure this
 * repository keeps meeting.
 */
export function parseAriaSnapshot(snapshot: string): { nodes: AriaNode[]; unparsed: number } {
  const nodes: AriaNode[] = [];
  let unparsed = 0;

  for (const raw of snapshot.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = LINE.exec(raw);
    if (line === null) {
      unparsed += 1;
      continue;
    }
    const indent = (line[1] ?? '').length;
    const body = unquote((line[2] ?? '').trim());
    // A property of the node above, not a node: `/url`, `/checked`, and friends.
    if (body.startsWith('/')) continue;

    const parsed = NODE.exec(body);
    if (parsed === null) {
      unparsed += 1;
      continue;
    }
    const role = parsed[1] ?? '';
    if (role === 'text') continue;

    const states = (parsed[3] ?? '')
      .split(/\]\s*\[?/)
      .map((state) => state.replace(/[[\]]/g, '').trim())
      .filter((state) => state !== '');

    nodes.push({
      role,
      name: parsed[2] === undefined ? null : parsed[2].replace(/\\"/g, '"'),
      states,
      text: parsed[4] === undefined || parsed[4].trim() === '' ? null : parsed[4].trim(),
      depth: Math.floor(indent / 2),
    });
  }
  return { nodes, unparsed };
}

export interface AriaReading {
  /** Everything the tree held, for a caller that wants the structure. */
  nodes: AriaNode[];
  /** Nodes a session can operate. */
  widgets: AriaNode[];
  /** Nodes that say something to the user — the blindness this exists to close. */
  announcements: AriaNode[];
  /** Lines the parser could not read. Non-zero means this reading understates the page. */
  unparsed: number;
}

/**
 * What the browser says is on the page.
 *
 * `root` defaults to `body` rather than `:root`, because the `html` element contributes a
 * document node and nothing a session acts on.
 */
export async function readAria(page: Page, root = 'body'): Promise<AriaReading> {
  const locator = page.locator(root) as unknown as { ariaSnapshot: () => Promise<string> };
  const { nodes, unparsed } = parseAriaSnapshot(await locator.ariaSnapshot());
  return {
    nodes,
    widgets: nodes.filter((node) => WIDGET_ROLES.has(node.role)),
    // By role only. The first version also checked for a `live` state flag, and that branch
    // could never fire: `ariaSnapshot()` emits no such flag. Measured 2026-10-02 — a plain
    // `<div aria-live="polite">Saved automatically</div>` appears as `- text: Saved
    // automatically`, with no role at all, and this parser drops text nodes. So an announcement
    // region that carries `aria-live` and no role is **not** recoverable here, and item 4's text
    // projection is still needed. A check that cannot fail is worse than an absent one, because
    // it reads as coverage.
    announcements: nodes.filter((node) => ANNOUNCEMENT_ROLES.has(node.role)),
    unparsed,
  };
}

/** Just enough of a harvested control to compare: both sources carry a role and a name. */
export interface Identified {
  role: string | null;
  name: string | null;
}

const key = (role: string | null, name: string | null): string =>
  `${(role ?? '').toLowerCase()}\u0000${(name ?? '').trim().toLowerCase()}`;

/**
 * Widgets the browser reports that the selector sweep did not find.
 *
 * Matched on role **and** name, which is the pair both sources compute independently — a
 * weaker join than element identity and the only one available across two sources that never
 * share a handle. It will therefore occasionally pair two genuinely different controls that
 * share a role and a name, which **understates** the gap. Erring that way is deliberate: a
 * blind spot reported too small is a smaller lie than one invented.
 *
 * Returned rather than counted, so a caller can print what is missing instead of a number
 * nobody can act on.
 */
export function selectorBlindSpots(
  harvested: readonly Identified[],
  widgets: readonly AriaNode[],
): AriaNode[] {
  const seen = new Set(harvested.map((control) => key(control.role, control.name)));
  return widgets.filter((widget) => !seen.has(key(widget.role, widget.name)));
}

/**
 * A locator for an aria node, in the form this repository's stability ladder prefers.
 *
 * `getByRole` with a name is `text-dependent` rather than `stable` — it breaks when the copy
 * or the locale changes — and for a control with no test id and no hand-written id it is
 * still the best hook that exists. Said here so a caller passing this to a role never reads
 * it as a recommendation.
 */
export function ariaLocator(node: AriaNode): string {
  return node.name === null || node.name === ''
    ? `getByRole('${node.role}')`
    : `getByRole('${node.role}', { name: ${JSON.stringify(node.name)} })`;
}

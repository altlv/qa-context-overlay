import type { Locator, Page } from '@playwright/test';
import { accessibleNameFrom } from './accessible-name.js';
import { INTERACTIVE_SELECTOR } from './controls.js';
import {
  describeFingerprint,
  explainMatch,
  contradictions,
  findBest,
  isStableId,
  score,
  type Fingerprint,
} from './identity.js';
import { defaultRole } from './page-scanner.js';

/**
 * The half of self-healing that `identity.ts` deliberately left out: **doing
 * something about it**.
 *
 * `identity.ts` answers "are these two observations the same element?". That is a
 * scorer, and a scorer with no caller heals nothing. This module is the caller:
 * it records what a selector pointed at, notices when the selector stops
 * resolving, looks for the same control among what is on the page now, and hands
 * back a locator together with the evidence for why it is the right one.
 *
 * Three rules shape everything here, and each exists because the obvious
 * implementation of self-healing is worse than no self-healing at all.
 *
 * **A working selector is never second-guessed.** If the selector the test was
 * written with still resolves to exactly one element, that element wins — no
 * scoring, no candidates, no opinion. Healing is a fallback, not a policy.
 *
 * **A heal that is not decisive is refused.** A row of identical `Edit` buttons
 * produces several candidates a hair apart. Picking the first is a coin toss
 * wearing a confidence score. The caller gets `ambiguous` and no locator, and the
 * test fails — which is the correct outcome, because nobody can say what the test
 * meant.
 *
 * **A healed run is not a clean run.** Every heal is recorded and surfaced
 * through the gate. A test that passes against an element it does not name has
 * proved the behaviour and lost its description of the thing it proved it
 * against; that is real debt and it must be visible. Nothing here ever rewrites a
 * test file — a heal is a *proposal*, reviewed by a person, which is why the
 * replacement selector is part of the record.
 */

/** What a selector pointed at, the last time anyone looked. */
export interface Baseline {
  /**
   * The selector the test uses, in Playwright selector syntax — `#submit`,
   * `[name="title"]`, `role=button[name="Add"]`. Not a generated expression like
   * `getByRole('button', …)`: this string is handed to `page.locator()`.
   */
  selector: string;
  /** What it resolved to when the baseline was taken. */
  fingerprint: Fingerprint;
  /** Where it was taken. A baseline is only meaningful against its own origin. */
  url: string;
  recordedAt: string;
}

export type HealStatus =
  /** The original selector still resolves to the control it was baselined against. */
  | 'intact'
  /**
   * The selector resolves to exactly one element, but that element no longer
   * looks like what was baselined.
   *
   * The locator is still handed back — the selector is what the test asked for,
   * and refusing here would fail every legitimate rename. But the run must say so,
   * because the other reading is that an id was recycled onto a different control
   * and the test is now exercising something nobody meant.
   */
  | 'drifted'
  /** The original found nothing; one candidate was clearly the same control. */
  | 'healed'
  /** Either the original matched several, or no candidate was clearly best. */
  | 'ambiguous'
  /** Nothing on the page is recognisably this control any more. */
  | 'lost'
  /** The page is not the one the baseline describes, so it was not searched. */
  | 'wrong-page';

export interface HealRecord {
  selector: string;
  status: HealStatus;
  /** What the baseline described, in words. */
  was: string;
  /** What it was healed to, in words. Null unless healed. */
  now: string | null;
  /** The selector the test should be changed to say. Null unless healed. */
  proposed: string | null;
  /** Why, in words — the signals that agreed and the ones that did not. */
  evidence: string;
  url: string;
  at: string;
  /** Rival candidates, when the ranking was too close to call. */
  alternatives: string[];
}

export interface Resolution {
  /** A usable locator, or null when the caller must not proceed. */
  locator: Locator | null;
  record: HealRecord;
}

export interface HealOptions {
  /** Minimum match score before a candidate is considered at all. */
  threshold?: number;
  /** Restrict the candidate search to a subtree. */
  within?: string;
  testIdAttribute?: string;
}

export interface Candidate {
  /** Playwright selector reaching this element in the page as it is right now. */
  path: string;
  fingerprint: Fingerprint;
}

// One definition, in `./controls.js`. It used to be written out here, in `reveal.ts` and
// inline in `page-scanner.ts`, with nothing holding the three to each other.
const INTERACTIVE = INTERACTIVE_SELECTOR;

/**
 * Every element on the page that could be the one we lost, each with a way back
 * to it.
 *
 * The path is a positional `nth-child` chain — exactly the kind of selector the
 * rest of the harness reports as fragile, and that is fine here: it is used
 * within milliseconds of being built and never written down. The durable answer
 * is `proposeSelector`, which is what the record carries.
 *
 * Shadow boundaries break a CSS chain, so each root contributes its own segment
 * and they are joined with Playwright's `>>` chaining. Without this the healer
 * would report every Web Components control as lost — the same blind spot that
 * made the scanner see an empty page on the Polymer shop.
 */
export async function harvestCandidates(
  page: Page,
  options: HealOptions = {},
): Promise<Candidate[]> {
  const scope = options.within ?? null;
  const testIdAttr = options.testIdAttribute ?? 'data-testid';

  // Runs in the browser: no named or const-assigned functions, because
  // tsx/esbuild rewrites those to call a `__name` helper the page does not have.
  const raw = await page.evaluate(
    ([selector, testIdAttribute, within]: [string, string, string | null]) => {
      const roots: (Document | ShadowRoot | Element)[] = [
        within === null ? document : (document.querySelector(within) ?? document),
      ];
      const found: Element[] = [];

      for (let index = 0; index < roots.length; index += 1) {
        const root = roots[index];
        if (root === undefined) continue;
        for (const el of Array.from(root.querySelectorAll(selector))) found.push(el);
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot !== null) roots.push(el.shadowRoot);
        }
      }

      const out: {
        path: string;
        tag: string;
        role: string | null;
        nameParts: {
          ariaLabel: string | null;
          labelledByText: string | null;
          labelText: string | null;
          text: string | null;
          imageAlt: string | null;
          value: string | null;
          placeholder: string | null;
          title: string | null;
        };
        testId: string | null;
        fieldName: string | null;
        id: string | null;
        type: string | null;
        href: string | null;
        ancestors: string[];
        siblingIndex: number;
        nearbyText: string | null;
        constraints: string | null;
      }[] = [];

      for (const el of found) {
        if ((el as HTMLInputElement).type === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;

        // Walk to the document root, starting a new segment at every shadow
        // boundary. parentNode rather than parentElement: the former *is* the
        // ShadowRoot, which is how the boundary gets noticed at all.
        const segments: string[] = [];
        let chunk: string[] = [];
        let node: Element | null = el;
        let guard = 0;
        while (node !== null && guard < 200) {
          guard += 1;
          const parent: Node | null = node.parentNode;
          if (parent === null) break;
          const kids = Array.from((parent as Element).children ?? []);
          chunk.unshift(`${node.tagName.toLowerCase()}:nth-child(${kids.indexOf(node) + 1})`);
          if (parent.nodeType === 11) {
            segments.unshift(chunk.join(' > '));
            chunk = [];
            node = (parent as ShadowRoot).host;
            continue;
          }
          if (parent.nodeType === 9) break;
          node = parent as Element;
        }
        segments.unshift(chunk.join(' > '));

        const ownId = el.getAttribute('id');
        const labelledBy = el.getAttribute('aria-labelledby');
        // The raw sources only. The name is decided once, in Node, by
        // `accessibleNameFrom` — the same function the scanner uses. This file used to run
        // its own ladder here, which read neither `alt` nor `value`, so an icon button, a
        // logo link and an `input[type=submit]` were all nameless to the healer while the
        // scanner named them correctly. The accessible name is the strongest signal the
        // matcher has and the join key between the two element sources, so the two of them
        // disagreeing corrupted the thing that detects drift.
        const nameParts = {
          ariaLabel: el.getAttribute('aria-label'),
          labelledByText:
            labelledBy === null ? null : (document.getElementById(labelledBy)?.textContent ?? null),
          labelText:
            ownId === null || ownId === ''
              ? null
              : (document.querySelector(`label[for="${CSS.escape(ownId)}"]`)?.textContent ?? null),
          text: (el as HTMLElement).innerText ?? null,
          imageAlt:
            Array.from(el.querySelectorAll('img[alt]'))
              .map((img) => img.getAttribute('alt') ?? '')
              .find((alt) => alt.trim() !== '') ?? null,
          value: (el as HTMLInputElement).value ?? null,
          placeholder: el.getAttribute('placeholder'),
          title: el.getAttribute('title'),
        };

        const ancestors: string[] = [];
        let up: Element | null = el.parentElement;
        while (up !== null && ancestors.length < 8) {
          ancestors.unshift(up.tagName.toLowerCase());
          up = up.parentElement;
        }

        // What surrounds it: a label, a heading, the other cells of its row. The
        // element's own words are removed so this stays an independent signal
        // rather than an echo of the accessible name.
        const ownText = ((el as HTMLElement).innerText ?? '').trim();
        let nearby =
          el.parentElement === null ? '' : ((el.parentElement as HTMLElement).innerText ?? '');
        if (ownText !== '' && nearby.includes(ownText)) nearby = nearby.replace(ownText, ' ');
        nearby = nearby.replace(/\s+/g, ' ').trim().slice(0, 120);

        const siblings: Element[] =
          el.parentElement === null ? [] : Array.from(el.parentElement.children);
        const isField =
          el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
        const constraints = [
          el.hasAttribute('required') ? 'required' : '',
          el.getAttribute('min') ?? '',
          el.getAttribute('max') ?? '',
          el.getAttribute('pattern') ?? '',
          el.getAttribute('maxlength') ?? '',
        ].filter((bit) => bit !== '');

        out.push({
          path: segments.filter((segment) => segment !== '').join(' >> '),
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          nameParts,
          testId: el.getAttribute(testIdAttribute),
          fieldName: isField ? el.getAttribute('name') : null,
          id: ownId === '' ? null : ownId,
          type: el.getAttribute('type'),
          href: el.getAttribute('href'),
          ancestors,
          siblingIndex: siblings.indexOf(el),
          nearbyText: nearby === '' ? null : nearby,
          constraints: constraints.length === 0 ? null : constraints.join('|'),
        });
      }

      return out;
    },
    [INTERACTIVE, testIdAttr, scope] as [string, string, string | null],
  );

  return raw.map((element) => ({
    path: element.path,
    fingerprint: {
      tag: element.tag,
      // The implied role, not only the attribute. Most pages write no `role` at
      // all, so comparing the raw attribute would leave the signal uncomparable
      // on exactly the pages that need it most.
      role: element.role ?? defaultRole(element.tag, element.type),
      name: accessibleNameFrom(element.nameParts),
      testId: element.testId,
      fieldName: element.fieldName,
      id: element.id,
      type: element.type,
      href: element.href,
      ancestors: element.ancestors,
      siblingIndex: element.siblingIndex < 0 ? null : element.siblingIndex,
      nearbyText: element.nearbyText,
      constraints: element.constraints,
    } satisfies Fingerprint,
  }));
}

/**
 * Which harvested candidate a selector resolves to, or -1.
 *
 * Asked of the page rather than re-derived here: identity of a DOM node is not
 * something that survives being described twice, and a baseline pinned to the
 * wrong candidate would poison every heal built on it.
 */
async function indexOfSelector(page: Page, selector: string, paths: string[]): Promise<number> {
  return page.locator(selector).evaluate((el, candidatePaths: string[]) => {
    for (let index = 0; index < candidatePaths.length; index += 1) {
      const segments = (candidatePaths[index] ?? '').split(' >> ');
      let scope: Document | ShadowRoot | null = document;
      let resolved: Element | null = null;

      for (let step = 0; step < segments.length; step += 1) {
        if (scope === null) break;
        resolved = scope.querySelector(segments[step] ?? '');
        if (resolved === null) break;
        // Only descend when another segment is waiting: the final resolution has
        // to be the element itself, not the shadow root hanging off it.
        scope = step + 1 < segments.length ? resolved.shadowRoot : null;
      }

      if (resolved !== null && resolved === el) return index;
    }
    return -1;
  }, paths);
}

/**
 * Records what a selector currently points at, so a later run can recognise it.
 *
 * Refuses an ambiguous selector. A baseline taken from the first of three
 * matching elements describes an element the test may never have meant, and
 * every heal built on it inherits that mistake silently.
 */
export async function captureBaseline(
  page: Page,
  selector: string,
  options: HealOptions = {},
): Promise<Baseline> {
  const found = await page.locator(selector).count();
  if (found === 0) throw new Error(`Cannot baseline "${selector}": it matches nothing.`);
  if (found > 1) {
    throw new Error(
      `Cannot baseline "${selector}": it matches ${found} elements, so there is no single ` +
        `element to describe. Narrow the selector first.`,
    );
  }

  const candidates = await harvestCandidates(page, options);
  const index = await indexOfSelector(
    page,
    selector,
    candidates.map((candidate) => candidate.path),
  );

  if (index < 0) {
    throw new Error(
      `Cannot baseline "${selector}": it resolves to an element the healer does not treat as ` +
        `interactive, so no later run could recognise it.`,
    );
  }

  return {
    selector,
    fingerprint: candidates[index]!.fingerprint,
    url: page.url(),
    recordedAt: new Date().toISOString(),
  };
}

/** Same document, in the sense that matters: healing must never cross an origin. */
function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return left === right;
  }
}

/**
 * The durable selector a healed test should be changed to say.
 *
 * Deliberately not the positional path the heal used to reach the element: that
 * path is correct for this render and rots on the next one. This is the best
 * *stable* hook the element now offers, and it is what a person reviews.
 *
 * The `name` attribute outranks the id here, which is the opposite of the
 * scanner's ladder and deliberate. A heal has just demonstrated that something
 * about this element's identity moved, so the question is not "what is the
 * tidiest hook" but "what is the least likely to move next". A form field's
 * `name` is a contract with the server and changing it breaks the backend; an id
 * is decoration, and the next redesign can regenerate it freely.
 */
export function proposalLadder(
  fingerprint: Fingerprint,
  testIdAttribute = 'data-testid',
): string[] {
  const rungs: string[] = [];
  if (fingerprint.testId !== null) rungs.push(`[${testIdAttribute}="${fingerprint.testId}"]`);
  if (fingerprint.fieldName !== null) rungs.push(`[name="${fingerprint.fieldName}"]`);
  if (isStableId(fingerprint.id)) rungs.push(`#${fingerprint.id}`);
  if (fingerprint.role !== null && fingerprint.name !== null) {
    rungs.push(`role=${fingerprint.role}[name=${JSON.stringify(fingerprint.name)}]`);
  }
  if (fingerprint.name !== null) rungs.push(`text=${JSON.stringify(fingerprint.name)}`);
  return rungs;
}

/** The best rung, without asking the page whether it actually works. */
export function proposeSelector(
  fingerprint: Fingerprint,
  testIdAttribute = 'data-testid',
): string | null {
  return proposalLadder(fingerprint, testIdAttribute)[0] ?? null;
}

/**
 * The best rung that resolves to exactly one element on this page.
 *
 * Proposing without checking was its own defect: two row links distinguished only
 * by their href healed correctly and decisively, and the record then advised
 * `role=link[name="Edit"]` — which matches both, so anyone following the advice
 * traded a broken selector for a strict-mode violation.
 *
 * Null when no rung is unique. That is not a failure of the healer; it is a
 * finding about the page. A control with no selector that singles it out is
 * exactly what `auditTestability` calls ambiguous, and saying so is more useful
 * than inventing a selector that does not work.
 */
async function verifiedProposal(
  page: Page,
  fingerprint: Fingerprint,
  testIdAttribute?: string,
): Promise<string | null> {
  for (const rung of proposalLadder(fingerprint, testIdAttribute)) {
    const count = await page
      .locator(rung)
      .count()
      .catch(() => 0);
    if (count === 1) return rung;
  }
  return null;
}

/**
 * Resolves a baseline against the page as it is now, healing if it has to.
 *
 * The order of the checks is the design: the original selector is tried first and
 * wins outright, ambiguity is reported rather than resolved, and a heal is only
 * accepted when one candidate is clearly ahead of the rest.
 */
export async function resolveLocator(
  page: Page,
  baseline: Baseline,
  options: HealOptions = {},
): Promise<Resolution> {
  const url = page.url();
  const base = {
    selector: baseline.selector,
    was: describeFingerprint(baseline.fingerprint),
    url,
    at: new Date().toISOString(),
    alternatives: [] as string[],
  };

  const original = page.locator(baseline.selector);
  const matches = await original.count();

  if (matches > 1) {
    // Not a healing problem. The selector resolves — to too much. Choosing one
    // would turn a strict-mode violation, which is a loud and accurate failure,
    // into a silent guess.
    return {
      locator: null,
      record: {
        ...base,
        status: 'ambiguous',
        now: null,
        proposed: null,
        evidence: `the original selector matches ${matches} elements; healing cannot pick between them`,
      },
    };
  }

  if (matches === 0 && !sameOrigin(url, baseline.url)) {
    // The classic self-healing disaster: the test navigated somewhere it should
    // not have, the element is "missing" for that reason, and the healer finds a
    // plausible lookalike on the wrong site. The test then passes having proved
    // nothing about the application under test.
    return {
      locator: null,
      record: {
        ...base,
        status: 'wrong-page',
        now: null,
        proposed: null,
        evidence: `baseline was recorded on ${baseline.url}; this page is ${url}`,
      },
    };
  }

  const candidates = await harvestCandidates(page, options);

  if (matches === 1) {
    // A resolving selector still wins — but *which* element it resolves to is now
    // checked rather than assumed. Storing a fingerprint and then never looking at
    // it on the common path meant an id recycled onto a different control passed
    // in silence: `#primary` went from "Delete account" to "Subscribe" and the run
    // reported nothing at all.
    const index = await indexOfSelector(
      page,
      baseline.selector,
      candidates.map((c) => c.path),
    );

    if (index < 0) {
      // It resolves to something the healer would never have offered as a
      // candidate — hidden, or not interactive. Worth saying, because the two
      // halves disagreeing about what counts as an element is how a locator ends
      // up pointing at a hidden twin of the control the test meant.
      return {
        locator: original,
        record: {
          ...base,
          status: 'drifted',
          now: null,
          proposed: null,
          evidence: 'resolves to an element that is hidden or not interactive',
        },
      };
    }

    const found = candidates[index]!;
    const agreement = score(baseline.fingerprint, found.fingerprint);
    const conflicts = contradictions(agreement);

    if (conflicts.length === 0) {
      return {
        locator: original,
        record: {
          ...base,
          status: 'intact',
          now: null,
          proposed: null,
          evidence: 'selector intact',
        },
      };
    }

    return {
      locator: original,
      record: {
        ...base,
        status: 'drifted',
        now: describeFingerprint(found.fingerprint),
        proposed: await verifiedProposal(page, found.fingerprint, options.testIdAttribute),
        evidence:
          `still resolves, but ${conflicts.join(' and ')} now disagree with the baseline — ` +
          explainMatch(agreement),
      },
    };
  }

  const ranked = findBest(
    baseline.fingerprint,
    candidates.map((candidate) => candidate.fingerprint),
    options.threshold,
  );

  if (ranked.best === null) {
    return {
      locator: null,
      record: {
        ...base,
        status: 'lost',
        now: null,
        proposed: null,
        evidence: `no candidate among ${candidates.length} on the page was recognisably the same control`,
      },
    };
  }

  if (!ranked.decisive) {
    return {
      locator: null,
      record: {
        ...base,
        status: 'ambiguous',
        now: null,
        proposed: null,
        evidence: `${ranked.ranked.length} candidates scored within a hair of each other — the signals cannot tell them apart`,
        alternatives: ranked.ranked
          .slice(0, 4)
          .map(
            (entry) =>
              `${describeFingerprint(candidates[entry.index]!.fingerprint)} ` +
              `(${entry.result.score.toFixed(2)})`,
          ),
      },
    };
  }

  const winner = candidates[ranked.best.index]!;
  const healed = page.locator(winner.path);

  // The path was built from a snapshot. If the page moved on between the harvest
  // and now, it addresses nothing or several things, and reporting a heal would
  // be reporting a locator that does not work.
  if ((await healed.count()) !== 1) {
    return {
      locator: null,
      record: {
        ...base,
        status: 'lost',
        now: null,
        proposed: null,
        evidence: 'the page changed while the candidates were being read',
      },
    };
  }

  return {
    locator: healed,
    record: {
      ...base,
      status: 'healed',
      now: describeFingerprint(winner.fingerprint),
      proposed: await verifiedProposal(page, winner.fingerprint, options.testIdAttribute),
      evidence: explainMatch(ranked.best.result),
    },
  };
}

export interface HealSummary {
  intact: number;
  drifted: number;
  healed: number;
  ambiguous: number;
  lost: number;
  wrongPage: number;
  /** Everything that is not `intact` — what the gate needs to know about. */
  notIntact: HealRecord[];
}

/**
 * Collects what happened to every locator across a run.
 *
 * Exists because the dangerous heal is the one nobody sees. A single healed
 * selector in a green run is invisible to whoever reads the result, and the next
 * rename lands on a test that was already describing the wrong element.
 */
export class HealJournal {
  private readonly records: HealRecord[] = [];

  record(record: HealRecord): void {
    this.records.push(record);
  }

  all(): readonly HealRecord[] {
    return this.records;
  }

  summarise(): HealSummary {
    const count = (status: HealStatus): number =>
      this.records.filter((record) => record.status === status).length;
    return {
      intact: count('intact'),
      drifted: count('drifted'),
      healed: count('healed'),
      ambiguous: count('ambiguous'),
      lost: count('lost'),
      wrongPage: count('wrong-page'),
      notIntact: this.records.filter((record) => record.status !== 'intact'),
    };
  }
}

/** The journal as something a person can read and act on. */
export function formatHeals(records: readonly HealRecord[]): string {
  const interesting = records.filter((record) => record.status !== 'intact');
  if (interesting.length === 0) {
    return `All ${records.length} locator(s) resolved as written. Nothing was healed.`;
  }

  const lines = [
    `${interesting.length} of ${records.length} locator(s) did not resolve as written.`,
    '',
  ];

  for (const record of interesting) {
    lines.push(`${record.status.toUpperCase()}  ${record.selector}`);
    lines.push(`  was:      ${record.was}`);
    if (record.now !== null) lines.push(`  now:      ${record.now}`);
    lines.push(`  evidence: ${record.evidence}`);
    if (record.proposed !== null) lines.push(`  change the test to: ${record.proposed}`);
    for (const alternative of record.alternatives) lines.push(`  rival:    ${alternative}`);
    lines.push('');
  }

  lines.push(
    'A healed selector is a proposal, not a fix. The test passed against an element it does',
    'not name; until the selector is updated, the next rename has nothing left to hold on to.',
  );
  return lines.join('\n');
}

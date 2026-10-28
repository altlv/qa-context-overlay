/**
 * Has the page changed under us since the last scan?
 *
 * **Why this exists.** This harness points agents at applications it does not own. A scan is a
 * snapshot of a page's surface — its controls, its endpoints, its testability findings — and
 * everything downstream of one is built on the assumption that the snapshot still describes the
 * page: the cases `npm run ideas` generates, the context a session is given, the selectors a spec
 * holds. When the target changes, all of that silently describes a page that is gone, and the way
 * it surfaces is a confusing test failure three weeks later. `PLAN.md` items 20 and 21.
 *
 * **Two scan shapes exist on disk.** `npm run scan` writes `{ stack, scan, dictionary }`. Older
 * committed scans are a bare `PageScan`, and the only one in the repo —
 * `apps/countdown-timer/scans/timer.json` — is that older shape. `npm run ideas` refuses it out
 * loud, and so does this: it predates the constraint format, so a diff against it would compare
 * fields that did not mean the same thing. `readScanPayload` is where that decision lives, and it
 * is a function rather than a few lines in the CLI because a refusal nothing can test is a
 * refusal that stops happening. The first version of this module left parsing to the CLI, which
 * cast straight to `PageScan`; fed the shape `scan` actually writes, it reached `.map` on
 * `undefined` and exited 1 — reporting drift, from a comparison that never happened.
 *
 * **Three outcomes, and the middle one is the point.** No drift, drift found, and *could not
 * compare* — which must never read as either of the others. Exit 1 means "I looked and the page
 * moved"; a missing file or an unparseable scan reported as exit 1 invents drift that was never
 * measured. That is worse than the false pass this repo fixed in `mutation-scope.ts`, because a
 * false finding sends someone looking for a change that did not happen.
 */

import { prune } from '../qe/run-history.js';
import type { PageScan, ScannedElement, TestabilityIssue } from '../tools/page-scanner.js';

export interface EndpointRef {
  method: string;
  path: string;
}

/** A field whose value changed rather than appeared or went. */
export interface ChangedValue {
  field: string;
  before: string;
  after: string;
}

/** One testability finding about the same element whose severity or wording moved. */
export interface ChangedIssue {
  kind: string;
  element: string;
  before: TestabilityIssue;
  after: TestabilityIssue;
}

export interface DriftResult {
  /**
   * `url` or `title` moved.
   *
   * Separated from everything else because it answers a different question: a changed URL may
   * mean the page was reorganised, or it may mean this scan is of a *different page* and every
   * other difference below is noise. A reader needs to see that first.
   */
  identityChanged: ChangedValue[];
  controlsAppeared: ScannedElement[];
  controlsDisappeared: ScannedElement[];
  endpointsAppeared: EndpointRef[];
  endpointsDisappeared: EndpointRef[];
  testabilityAppeared: TestabilityIssue[];
  testabilityResolved: TestabilityIssue[];
  /**
   * Same finding, same element, different severity or wording.
   *
   * Without this a finding escalating from `medium` to `high` is invisible: the key that
   * identifies it has not changed, so it neither appeared nor resolved. Identity stays
   * `kind` + `element` — it is the same finding about the same thing — and the movement is
   * reported as its own category rather than as a disappearance and an arrival.
   */
  testabilityChanged: ChangedIssue[];
  /**
   * Frames and shadow roots the scan admits it cannot see into.
   *
   * A new one is drift of the most consequential kind: a region of the page that has appeared
   * and that no selector sweep, accessibility tree or endpoint list below describes. A payment
   * field is an iframe by design, so this is how one arriving becomes visible at all.
   */
  blindRegionsAppeared: string[];
  blindRegionsDisappeared: string[];
  /**
   * Controls the accessibility tree reports that the selector sweep missed.
   *
   * Tracked because specs are built on the sweep. A widget moving into this list has become
   * unaddressable by the source every generated selector comes from, while still being present
   * on the page — which reads as "nothing changed" to a diff that only counts controls.
   */
  ariaBlindSpotsAppeared: string[];
  ariaBlindSpotsResolved: string[];
}

/**
 * The verdict.
 *
 * `could-not-compare` carries no result and no drift counts, so no caller can read a number off a
 * comparison that did not happen. `no-drift` is only reachable from a completed diff.
 */
export type ScanDriftOutcome =
  | { kind: 'no-drift' }
  | { kind: 'drift-found'; result: DriftResult }
  | { kind: 'could-not-compare'; reason: string };

/** Why a file could not be used as a scan. Separate from the drift verdict, which needs two. */
export type ScanReadOutcome =
  { kind: 'scan'; scan: PageScan } | { kind: 'not-usable'; reason: string };

/**
 * One scan out of a file's contents, or the reason it cannot be one.
 *
 * Takes the raw text rather than a path so the decision is testable without a filesystem. The
 * three refusals it can give — not JSON, not a scan, the older shape — are B7's cases, and each
 * names itself, because "could not compare" with no reason sends a reader to the wrong file.
 */
export function readScanPayload(raw: string): ScanReadOutcome {
  let parsed: unknown;
  try {
    // A byte-order mark is not JSON. A scan re-saved by a Windows editor would otherwise read as
    // corrupt, which is the same rescue `archive-results.ts` makes for the same reason.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return { kind: 'not-usable', reason: 'the file is not valid JSON' };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { kind: 'not-usable', reason: 'the file does not hold a JSON object' };
  }

  const wrapper = parsed as { scan?: unknown; interactive?: unknown };

  // The shape `npm run scan` writes.
  if (wrapper.scan !== undefined) {
    const inner = wrapper.scan as { interactive?: unknown };
    if (!Array.isArray(inner.interactive)) {
      return {
        kind: 'not-usable',
        reason: 'it has a `scan` key but no `scan.interactive` array, so it is not a page scan',
      };
    }
    return { kind: 'scan', scan: wrapper.scan as PageScan };
  }

  // A bare PageScan: the older committed shape. Recognised so it can be named, never diffed.
  if (Array.isArray(wrapper.interactive)) {
    return {
      kind: 'not-usable',
      reason:
        'it is the older bare-PageScan scan format, which predates the constraint format and ' +
        'cannot be compared field for field — re-scan the page with `npm run scan` to get a ' +
        'comparable snapshot',
    };
  }

  return {
    kind: 'not-usable',
    reason: 'it is not a scan — expected the .json that `npm run scan` writes',
  };
}

/**
 * The newest archived scan to compare against, by the timestamp **in the filename**.
 *
 * Never by file modification time: archiving copies a file, and a copy does not carry the
 * original's mtime, so an mtime-sorted history calls the most recently copied file the newest
 * scan. `run-history.ts` holds that rule and `prune` already implements it — asking it to keep one
 * name returns the newest it recognises, and a file a person dropped in the directory is not one
 * of ours and is not considered.
 */
export function pickBaseline(historyNames: readonly string[]): string | null {
  const { keep } = prune([...historyNames], 1);
  return keep[0] ?? null;
}

/**
 * What changed between two scans.
 *
 * **Controls are matched by their suggested locator, not by array position.** That locator is the
 * hook the harness actually interacts through, so if it changes the control has moved as far as
 * any automation is concerned. Position would be worse than imprecise: inserting one control near
 * the top shifts every later index, and a position-matched diff would report the whole tail of the
 * list as having changed.
 */
export function scanDrift(before: PageScan, after: PageScan): ScanDriftOutcome {
  const beforeControls = new Map(before.interactive.map((element) => [element.suggested, element]));
  const afterControls = new Map(after.interactive.map((element) => [element.suggested, element]));

  const controlsAppeared = [...afterControls.values()].filter(
    (element) => !beforeControls.has(element.suggested),
  );
  const controlsDisappeared = [...beforeControls.values()].filter(
    (element) => !afterControls.has(element.suggested),
  );

  const endpointKey = (endpoint: EndpointRef): string => `${endpoint.method}:${endpoint.path}`;
  const beforeEndpoints = new Set(before.endpoints.map(endpointKey));
  const afterEndpoints = new Set(after.endpoints.map(endpointKey));
  const endpointsAppeared = after.endpoints
    .filter((endpoint) => !beforeEndpoints.has(endpointKey(endpoint)))
    .map((endpoint) => ({ method: endpoint.method, path: endpoint.path }));
  const endpointsDisappeared = before.endpoints
    .filter((endpoint) => !afterEndpoints.has(endpointKey(endpoint)))
    .map((endpoint) => ({ method: endpoint.method, path: endpoint.path }));

  const issueKey = (issue: TestabilityIssue): string => `${issue.kind}:${issue.element}`;
  const beforeIssues = new Map(before.testability.map((issue) => [issueKey(issue), issue]));
  const afterIssues = new Map(after.testability.map((issue) => [issueKey(issue), issue]));
  const testabilityAppeared = after.testability.filter(
    (issue) => !beforeIssues.has(issueKey(issue)),
  );
  const testabilityResolved = before.testability.filter(
    (issue) => !afterIssues.has(issueKey(issue)),
  );
  const testabilityChanged: ChangedIssue[] = [];
  for (const [key, was] of beforeIssues) {
    const now = afterIssues.get(key);
    if (now === undefined) continue;
    if (was.severity !== now.severity || was.problem !== now.problem) {
      testabilityChanged.push({ kind: was.kind, element: was.element, before: was, after: now });
    }
  }

  const identityChanged: ChangedValue[] = [];
  if (before.url !== after.url) {
    identityChanged.push({ field: 'url', before: before.url, after: after.url });
  }
  if (before.title !== after.title) {
    identityChanged.push({ field: 'title', before: before.title, after: after.title });
  }

  // Frames and shadow hosts together: both are regions the scan does not enter, and a reader
  // acting on one acts on the other the same way — go and look inside it.
  const blindRegionsOf = (scan: PageScan): string[] => [
    ...(scan.frames ?? []).map((source) => `frame ${source}`),
    ...(scan.shadowHosts ?? []).map((host) => `shadow root ${host}`),
  ];
  const beforeBlind = new Set(blindRegionsOf(before));
  const afterBlind = new Set(blindRegionsOf(after));
  const blindRegionsAppeared = [...afterBlind].filter((region) => !beforeBlind.has(region));
  const blindRegionsDisappeared = [...beforeBlind].filter((region) => !afterBlind.has(region));

  const ariaBlindSpotsOf = (scan: PageScan): string[] =>
    (scan.aria?.widgetsMissedBySelectors ?? []).map(
      (widget) => `${widget.role} "${widget.name ?? 'unnamed'}" at ${widget.locator}`,
    );
  const beforeAria = new Set(ariaBlindSpotsOf(before));
  const afterAria = new Set(ariaBlindSpotsOf(after));
  const ariaBlindSpotsAppeared = [...afterAria].filter((spot) => !beforeAria.has(spot));
  const ariaBlindSpotsResolved = [...beforeAria].filter((spot) => !afterAria.has(spot));

  const result: DriftResult = {
    identityChanged,
    controlsAppeared,
    controlsDisappeared,
    endpointsAppeared,
    endpointsDisappeared,
    testabilityAppeared,
    testabilityResolved,
    testabilityChanged,
    blindRegionsAppeared,
    blindRegionsDisappeared,
    ariaBlindSpotsAppeared,
    ariaBlindSpotsResolved,
  };

  return countDrift(result) === 0 ? { kind: 'no-drift' } : { kind: 'drift-found', result };
}

/**
 * How many individual changes a result holds. Zero is what makes it `no-drift`.
 *
 * Summed over every array in the result rather than a hand-written list of them, so a category
 * added to `DriftResult` cannot be computed and then silently left out of the count — which would
 * make a real change report as no drift. `identityChanged` is the one that would have been easiest
 * to forget and the worst to miss.
 */
export function countDrift(result: DriftResult): number {
  return Object.values(result).reduce(
    (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
    0,
  );
}

/**
 * The drift, for a person: what changed, named, grouped by what it is.
 *
 * Plain text and no symbols, matching every other CLI here. A reader scanning output in a terminal
 * wants the names of the things that moved, which is the whole reason this is not a JSON dump.
 */
export function describeDrift(result: DriftResult): string {
  const sections: string[] = [];
  const section = (heading: string, lines: readonly string[]): void => {
    if (lines.length > 0) {
      sections.push(`${heading} (${lines.length}):\n${lines.map((l) => `  - ${l}`).join('\n')}`);
    }
  };
  const control = (element: ScannedElement): string =>
    `${element.suggested} [${element.role ?? 'no role'}]`;
  const issue = (found: TestabilityIssue): string =>
    `${found.kind}: ${found.problem} [${found.severity}]`;

  // First, because it may mean every section below describes a different page.
  section(
    'The page itself is not the same',
    result.identityChanged.map((c) => `${c.field}: "${c.before}" -> "${c.after}"`),
  );
  section('Controls that appeared', controlsOf(result.controlsAppeared, control));
  section('Controls that disappeared', controlsOf(result.controlsDisappeared, control));
  section(
    'Endpoints that appeared',
    result.endpointsAppeared.map((e) => `${e.method} ${e.path}`),
  );
  section(
    'Endpoints that disappeared',
    result.endpointsDisappeared.map((e) => `${e.method} ${e.path}`),
  );
  section('Testability findings that appeared', result.testabilityAppeared.map(issue));
  section('Testability findings that resolved', result.testabilityResolved.map(issue));
  section(
    'Testability findings that changed',
    result.testabilityChanged.map(
      (c) =>
        `${c.kind} on ${c.element}: [${c.before.severity}] "${c.before.problem}" -> ` +
        `[${c.after.severity}] "${c.after.problem}"`,
    ),
  );
  section('Regions the scan cannot see into, newly present', result.blindRegionsAppeared);
  section('Regions the scan cannot see into, now gone', result.blindRegionsDisappeared);
  section('Controls the selector sweep now misses', result.ariaBlindSpotsAppeared);
  section('Controls the selector sweep no longer misses', result.ariaBlindSpotsResolved);

  return `${countDrift(result)} change(s) since the baseline scan:\n\n${sections.join('\n\n')}`;
}

function controlsOf(
  elements: readonly ScannedElement[],
  render: (element: ScannedElement) => string,
): string[] {
  return elements.map(render);
}

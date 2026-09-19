import type { Browser, Page } from '@playwright/test';
import { harvestCandidates } from '../tools/heal.js';
import { StateModel, describeTransition } from './state-model.js';
import type { Transition } from './state-model.js';

/**
 * The harness's own eyes on the browser the agent is driving.
 *
 * Both connect to one Chromium over CDP: Playwright MCP because the run hands it
 * `--cdp-endpoint`, and this because it opens a second connection to the same
 * endpoint. So the page an action just changed can be read directly, in full, rather
 * than inferred from the text MCP wrote for the model. Proven on 2026-09-19 with a
 * spike before any of this was built: MCP's `browser_navigate` produced a page that
 * the observer connection then harvested.
 *
 * **Fail-soft, and loudly.** The guard in front of a tool call is fail-closed, because
 * a guard that did not decide must not read as permission. This is the opposite case:
 * the action has already happened, and refusing afterwards would prevent nothing while
 * killing a session over a page that happened to be mid-navigation. So a failed look
 * is counted and reported, never thrown — and because a missed look can hide a state,
 * **the count it produces is a floor whenever anything was missed**, which `summary()`
 * says outright. A ceiling enforced on an undercount is permissive, and that is worth
 * a reader knowing.
 */

export interface Observer {
  /** Look now, record, and say what moved. Null when the look could not be taken. */
  observe(): Promise<Transition | null>;
  /** For the guard. Narrow by design — the guard asks, it never records. */
  count(): number;
  atCeiling(maxStates: number): boolean;
  /** Looks that could not be taken. Above zero, `count()` is a floor. */
  missed(): number;
  /** Lines for the run summary. */
  summary(): string[];
}

/**
 * The page the agent is working in.
 *
 * MCP opens tabs as it goes, so this is asked fresh every time rather than captured
 * once — a handle taken at startup points at whatever was open then, which on a run
 * that navigates is the wrong page from the second action onwards.
 *
 * The most recently opened non-blank page is the working one. `about:blank` is
 * skipped because a browser launched for CDP starts with one and it is never where
 * the work is.
 */
export async function activePage(browser: Browser, waitMs = 2_000): Promise<Page | null> {
  const look = (): Page | null => {
    const pages = browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter((page) => !page.isClosed() && page.url() !== 'about:blank');
    return pages.at(-1) ?? null;
  };

  // A CDP connection learns about a target when the browser tells it, which is not
  // the instant the other client created one. After MCP's first `browser_navigate`
  // the page exists and this connection may not have been notified yet, so a single
  // look returns null and the run records a miss on the first action of the session.
  // Caught by `observer.int.test.ts` failing roughly one run in four, and it would
  // have undercounted every live session by at least one state.
  //
  // A bounded poll, not a sleep: it returns the moment a page appears, and gives up
  // rather than hanging, because "no page" is also a real answer — a run whose
  // browser never opened anything must still get an honest miss.
  const deadline = Date.now() + waitMs;
  for (;;) {
    const found = look();
    if (found !== null || Date.now() >= deadline) return found;
    await new Promise((resume) => setTimeout(resume, 25));
  }
}

export function pageObserver(find: () => Promise<Page | null>): Observer {
  const model = new StateModel();
  let missedLooks = 0;

  return {
    count: () => model.count(),
    atCeiling: (maxStates) => model.atCeiling(maxStates),
    missed: () => missedLooks,

    async observe() {
      try {
        const page = await find();
        if (page === null) {
          missedLooks += 1;
          return null;
        }
        const candidates = await harvestCandidates(page);
        return model.observe({
          url: page.url(),
          fingerprints: candidates.map((candidate) => candidate.fingerprint),
        });
      } catch {
        // A page mid-navigation, a tab closed between finding it and reading it, a
        // context torn down by the run ending. None of these is the session's fault
        // and none of them is worth ending it over.
        missedLooks += 1;
        return null;
      }
    },

    summary() {
      const lines = [`States visited: ${model.count()}`];
      if (missedLooks > 0) {
        lines.push(
          `${missedLooks} look(s) could not be taken, so that count is a FLOOR — the ` +
            'session may have reached states nothing recorded, and the state ceiling was ' +
            'therefore enforced on an undercount',
        );
      }
      return lines;
    },
  };
}

export { describeTransition };

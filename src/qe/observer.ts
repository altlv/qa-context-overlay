import type { Browser, Page } from '@playwright/test';
import { readAnnouncements } from '../tools/announcements.js';
import { harvestCandidates } from '../tools/heal.js';
import { arrivalLines, classifyArrival } from '../tools/surfaces.js';
import type { Arrival, ObserveOptions } from '../tools/surfaces.js';
import { describeFrontier, frontier, moveLabel, untriedControls } from './frontier.js';
import type { StateFrontier } from './frontier.js';
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
  observe(): Promise<Look | null>;
  /** For the guard. Narrow by design — the guard asks, it never records. */
  count(): number;
  atCeiling(maxStates: number): boolean;
  /** Looks that could not be taken. Above zero, `count()` is a floor. */
  missed(): number;
  /**
   * Name the move about to be made, so the edge it produces can be labelled.
   *
   * Called from the hook with the tool name and its arguments. Nothing called the model’s
   * `about()` before this, so every edge in every run was labelled `unknown`.
   */
  about(toolName: string, toolInput: unknown): void;
  /** Every state that still offers a control nothing acted on. */
  frontier(): StateFrontier[];
  /**
   * Controls in the state the session is standing in now that nothing has acted on.
   *
   * The frontier for **one** state rather than the whole graph: the agent is standing in one
   * place, and a list of every state’s leftovers is noise paid for out of the run’s own token
   * budget.
   */
  untriedHere(state: string): string[];
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

/**
 * One look, and what it meant.
 *
 * `observe` used to return the transition alone, which left no room for anything the state model
 * does not own. The arrival is one of those: deciding what kind of surface appeared needs the
 * **page**, and the model is deliberately page-free so it can be tested without a browser.
 */
export interface Look {
  transition: Transition;
  /**
   * What kind of surface arrived, or null.
   *
   * Null for three different reasons and the distinction matters to a reader: nothing appeared,
   * the arrivals named no surface (see `commonContainer`), or the observation of it failed. The
   * last of those is counted in `missed()` like any other failed look.
   */
  arrival: Arrival | null;
}

export function pageObserver(
  find: () => Promise<Page | null>,
  options: ObserveOptions = {},
): Observer {
  const model = new StateModel();
  let missedLooks = 0;
  const arrivals: Arrival[] = [];

  /**
   * The ceiling the guard last asked about, or null when nothing ever enforced one.
   *
   * The observer is not told `maxStates` — the guard holds it and asks `atCeiling` on every tool
   * call. Remembered here so the summary can say whether the run stopped with the frontier still
   * open, which is a different statement from a run that finished with it open. Null stays null: a
   * run nobody capped must not be reported as having run out of allowance.
   */
  let ceilingAsked: number | null = null;

  const frontierNow = (): StateFrontier[] =>
    frontier({
      states: model.graph().states,
      affordsIn: (state) => model.affordsIn(state),
      triedFrom: (state) => model.triedFrom(state),
    });

  return {
    count: () => model.count(),
    atCeiling: (maxStates) => {
      ceilingAsked = maxStates;
      return model.atCeiling(maxStates);
    },
    missed: () => missedLooks,
    about: (toolName, toolInput) => model.about(moveLabel(toolName, toolInput)),
    frontier: frontierNow,
    untriedHere: (state) => untriedControls(model.affordsIn(state), model.triedFrom(state)),

    async observe() {
      try {
        const page = await find();
        if (page === null) {
          missedLooks += 1;
          return null;
        }
        const candidates = await harvestCandidates(page);
        // Both projections from the same look, so what the page shows and what it says are
        // read at one moment rather than two. Reading them separately would let a toast
        // appear between the calls and be attributed to the wrong state.
        const announcements = await readAnnouncements(page);
        const transition = model.observe({
          url: page.url(),
          fingerprints: candidates.map((candidate) => candidate.fingerprint),
          announcements,
        });

        /**
         * What kind of thing arrived — the step that turns `src/tools/surfaces.ts` from a module
         * with tests into a module with a caller.
         *
         * Read **after** the state is recorded, and separately guarded. A classification is a
         * nicety; the state count is what a ceiling is enforced on, so a surface probe that threw
         * must not cost the harness a state it had already seen. The probe presses Tab and reads
         * layout, which on a page mid-navigation is exactly the sort of thing that fails.
         *
         * The paths come from `appearedAt`, which indexes the array this call just built, so
         * `candidates[index]` is the record for the same control. Mapping by fingerprint equality
         * instead would re-answer the identity question `matchAll` has already answered, and
         * answer it worse.
         */
        if (transition.appearedAt.length === 0) return { transition, arrival: null };
        try {
          const paths = transition.appearedAt.map((index) => candidates[index]!.path);
          const arrival = await classifyArrival(page, paths, options);
          if (arrival !== null) arrivals.push(arrival);
          return { transition, arrival };
        } catch {
          missedLooks += 1;
          return { transition, arrival: null };
        }
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
      lines.push(...arrivalLines(arrivals));
      // After the states and the surfaces, because it is the line that qualifies both: a state
      // count with nothing said about what was left untried reads as coverage.
      lines.push(
        ...describeFrontier(frontierNow(), ceilingAsked !== null && model.atCeiling(ceilingAsked)),
      );
      return lines;
    },
  };
}

export { describeTransition };

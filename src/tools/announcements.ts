import type { Page } from '@playwright/test';

/**
 * What the page is **saying**, as a projection of its own.
 *
 * The confirmed blindness, measured twice. A state is `url + set(control signatures)`, so a
 * `role=status` toast and a `role=alert` banner both left the state key **unchanged** — the page
 * said something to the user and nothing in the harness could perceive it as a change. Errors,
 * validation, confirmations, empty states and loading states all live there, which is a large
 * share of where real defects are.
 *
 * The accessibility tree dented it: `src/tools/aria.ts` finds an announcement that carries a
 * role. It cannot find one that does not — measured 2026-10-02, `<div aria-live="polite">Saved
 * automatically</div>` renders in the tree as a bare text node with no role at all. So this reads
 * the DOM directly and catches both, which is also why it is a third projection rather than a
 * fourth use of the tree.
 *
 * **Why not all visible text.** The obvious version of this projection is "the set of text blocks
 * on the page", and it is unusable: a clock, a cart counter, a relative timestamp or an ad would
 * make every page a new state on every look, and the state ceiling would be spent in seconds.
 * That is the same over-discrimination the accessible name caused through a counter, except
 * applied to the whole document. Announcement regions are the narrow, declared part of the page
 * whose entire purpose is to say something changed — so they are the part worth watching, and the
 * author has already marked them.
 */

/**
 * Regions whose job is to announce. `aria-live` catches what carries no role, which is the half
 * the accessibility tree cannot see.
 */
const ANNOUNCING =
  '[aria-live], [role=status], [role=alert], [role=log], [role=timer], [role=marquee]';

/**
 * One announcement reduced to what identifies it rather than what it currently reads.
 *
 * Digits become `N` for exactly the reason they do in `normaliseName`: a `role=timer` counting
 * down, or a status saying "3 of 12 uploaded", would otherwise be a new state on every tick, and
 * a projection that thrashes is worse than none — it would spend the ceiling and hide the screens
 * it was added to reveal. What survives is the shape of the sentence, which is what changes when
 * the application says something different rather than something updated.
 */
export function normaliseAnnouncement(text: string): string {
  return text.replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
}

/**
 * The announcements currently on the page, normalised and deduplicated.
 *
 * Empty regions contribute nothing, which matters more than it sounds: most live regions sit on
 * the page empty from load and fill only when something happens. Counting them would make the
 * projection a constant, and a constant in a state key is decoration.
 *
 * Hidden regions are skipped too. A toast container that is present but `display: none` is not
 * saying anything, and treating it as though it were would report an announcement nobody could
 * read — the mirror of missing one that they could.
 */
export async function readAnnouncements(page: Page): Promise<string[]> {
  // No named or const-assigned functions inside: tsx rewrites those with a `__name` helper the
  // page does not have. See the gotcha in CLAUDE.md.
  const texts = await page.evaluate((selector) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const text = ((el as HTMLElement).innerText ?? '').trim();
      if (text !== '') out.push(text);
    }
    return out;
  }, ANNOUNCING);

  return [...new Set(texts.map(normaliseAnnouncement))].filter((text) => text !== '').sort();
}

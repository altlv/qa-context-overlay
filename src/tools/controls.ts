/**
 * What counts as a control, in one place.
 *
 * This selector was written out **three times** — in `heal.ts`, in `reveal.ts`, and inline
 * inside the `page.evaluate` in `page-scanner.ts`. All three happened to carry the same twelve
 * selectors, by coincidence of maintenance rather than by construction, and nothing held them to
 * each other. Widen one and the agent's map, its state count and its hover sweep would disagree
 * about what a control *is* — three answers to one question, with no test able to notice.
 *
 * That is the same shape as every other assumption this fortnight: a hardcoded `src/`, a
 * hardcoded `node --test`, a regular expression read as a hostname. Each held until something
 * disagreed with it. The difference here is that the disagreement would be internal, so it would
 * not announce itself by failing — it would announce itself as a page that two parts of the
 * harness describe differently.
 *
 * **It is still a list, and still twelve names**, which is the limitation measured on 2026-10-02
 * and recorded under the discovery layer in `PLAN.md`: `role=option`, `role=combobox`,
 * `<summary>` and a focusable `div` are all operable and none are here. The accessibility tree in
 * `src/tools/aria.ts` is the second source that covers part of that gap. Collapsing the copies
 * does not widen the net; it makes widening it a single edit instead of three, which is the
 * precondition for doing it at all.
 *
 * Kept as a plain string because two of the three consumers pass it into the browser, where a
 * `page.evaluate` may hold no named or const-assigned function — see the gotcha in `CLAUDE.md`.
 */
export const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], ' +
  '[role=checkbox], [role=switch], [role=menuitem], [contenteditable=true]';

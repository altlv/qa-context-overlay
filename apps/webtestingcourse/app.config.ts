import type { AppConfig } from '../app-config.js';

/**
 * Deque's web testing course site — a practice storefront for the fake company
 * "CompuTech", published to teach accessibility testing and seeded with the defects
 * that lesson needs.
 *
 * **Why this subject earns a place beside academybugs.** Both are shops with planted
 * bugs, and they plant different kinds. AcademyBugs hides its defects in *rules* —
 * what a sort orders, what a discount does, which prices a signed-out visitor may
 * see. This one hides them in the **second rendering**: controls that are legible on
 * screen and absent from the accessibility tree, five links sharing one name, an
 * anchor covered by a paragraph so a click lands somewhere else. The scan of
 * 2026-10-10 found 1 stable locator against 10 ambiguous and 6 positional ones, and
 * two operable links the selector sweep never saw at all.
 *
 * That makes it the first subject where `visual-inspection`'s accessible-name pass and
 * `testability-audit` are pointed at the same page for different reasons — one asks
 * whether a person using assistive technology can operate the thing, the other
 * whether a test can address it, and here the answer differs control by control.
 *
 * `test` rather than `prod`: the site exists to be broken by students. It is still
 * someone else's host, so the policy's deny labels keep a session away from anything
 * that would place an order, and `stayOnOrigin` holds it on this one host.
 */
const config: AppConfig = {
  name: 'webtestingcourse',
  description:
    'Deque\'s web testing course site — a practice storefront for the fictional "CompuTech", published to teach accessibility testing. Server-rendered, no test ids, and seeded with defects in the accessibility tree rather than in its business rules: unnamed controls, five links sharing one name, and an anchor covered by another element.',
  environments: {
    test: {
      baseURL: 'https://webtestingcourse.dequecloud.com/',
      note: 'public teaching site, single origin, no sign-in required for the catalogue; order placement stays behind the policy deny labels',
    },
  },
  defaultEnvironment: 'test',
  scanScope: 'body',
  external: true,
  sourceRepo: 'https://webtestingcourse.dequecloud.com',
};

export default config;

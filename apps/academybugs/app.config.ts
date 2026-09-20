import type { AppConfig } from '../app-config.js';

/**
 * AcademyBugs — a practice storefront with bugs planted in it on purpose, and the
 * first subject here that is genuinely *rule-shaped*.
 *
 * Every earlier target was one screen and one behaviour. This one decides things:
 * how a sort orders products, what a discount does to a displayed price, how many
 * results a page-size control returns, and which prices a signed-out visitor is
 * allowed to see. Those are four rules, and `rule-modelling` exists for exactly
 * this — a rule's defects live in the rule, and no scan reveals one.
 *
 * `test` rather than `prod` for the same reason as the other practice targets: the
 * site invites people to break it. Writes here are cart operations scoped to a
 * session cookie, and the policy's deny labels already keep a session away from
 * checkout and payment.
 *
 * Unlike bugeater, the whole application lives on one origin, so `stayOnOrigin`
 * costs nothing here — a session can cross from the listing to a product, to the
 * cart, to the account pages without meeting a refusal.
 */
const config: AppConfig = {
  name: 'academybugs',
  description:
    'AcademyBugs practice storefront — a shop seeded with planted defects, whose sorting, discounting, page-size and login-gated pricing are rules rather than controls. The first subject with a cart, an account and more than one screen.',
  environments: {
    test: {
      baseURL: 'https://academybugs.com/find-bugs/',
      note: 'practice site, single origin; cart writes are session-scoped and checkout/payment stay behind the policy deny labels',
    },
  },
  defaultEnvironment: 'test',
  scanScope: 'body',
  external: true,
  sourceRepo: 'https://academybugs.com',
};

export default config;

# Apps — the subjects under test

**Everything here is a subject under test, not part of the harness.** The harness is
`src/`; the harness's own tests are `tests/`. Nothing in `src/` imports from `apps/`,
so deleting a folder here removes a target and changes nothing about the tool.

One folder per subject. Nothing in an app folder is shared with another, so adding a
new target cannot disturb an existing one.

```
apps/
  <app-name>/
    app.config.ts     name, baseURL, scan scope, web server, external flag
    tests/            specs written against this subject only
    pages/            page objects for this subject only (create when needed)
    scans/            page-scanner output, committed as a testability record
    coverage.md       what is covered, and what is deliberately not
    README.md         what the subject is, and what was learned about testing it
```

A subject may be code we ship (`todo-fixture`), or a site we merely point at
(`countdown-timer`, `fakerestapi`). Either way the harness only ever observes it — the
tests live here, the tooling does not.

## Adding a subject

1. `mkdir -p apps/<name>/tests`
2. Write `apps/<name>/app.config.ts` (see `apps/app-config.ts` for the contract)
3. Register it in `apps/registry.ts`

That is all. `playwright.config.ts` derives the project, test directory, base URL and
web server from the registry, so no other file needs editing.

## Local vs external

A subject with `external: true` is a third-party site. Those are excluded from
`npm test` and from CI, and run only via `npm run test:external`. A suite that goes red
because someone else's site is down trains people to ignore red.

External subjects also cannot be fixed. Testability findings against them are recorded
in the app's README so nobody re-audits them expecting action.

| Subject           | Kind     | What it is for                                                                                                                                                                 |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `todo-fixture`    | local    | Bundled todo app. Gives the suite and the network capture something real to exercise with no external dependency and no API key.                                               |
| `countdown-timer` | external | Practice app at testpages.eviltester.com. Time-based UI, used to prove the no-arbitrary-waits rule and as the `testability-reviewer` role's validation target.                 |
| `fakerestapi`     | external | Public practice REST API. The `api-coder` role's validation target: a real contract with three real defects, so an agent's findings can be checked rather than taken on trust. |

## Candidate subjects — parked, not registered

Supplied 2026-09-10. Deliberately **not** in `registry.ts`: registering fourteen
apps with no tests would make `npm run targets` noise and buy nothing. Each is
promoted individually, when there is a reason to point at it.

The third column is why the list is worth keeping. Several of these close a gap
`PLAN.md` already names, and picking by "what would this prove" beats picking by
whichever is most convenient.

### The scored benchmark — the one candidate that measures us back

| Subject         | URL                                  | What it would prove                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AcademyBugs** | <https://academybugs.com/find-bugs/> | **25 planted bugs across five named categories** — functional, visual, content, performance, crash — and it ships its own oracle. The counter overlay's `a.academy-tooltip-bug-link` elements carry found/unfound state in the DOM, per session, so a run's find rate is a **number** rather than a claim |

Every other subject on this page tells us whether the harness _runs_. This one tells
us whether it _finds anything_, against a denominator someone else chose.

That is the instrument `PLAN.md` calls H1 — a measured failure rate instead of an
opinion — and it was sitting on a page already being used for ad-hoc exploration.
First measurement, 2026-09-11: **a person with a browser ~30, the harness's tools ~8**,
and the harness scored zero in two of the five categories because it never interacts.

Registering it needs a decision the others do not. It is somebody's teaching product,
so treat it as **prod-tier politeness on a test-tier subject**: read, click, and probe
inputs, but no account creation, no purchase, and no hammering. The counter is
per-session state, which means a registered suite would have to re-find every bug on
every run — that is the point, and it is also why it needs its own charter rather than
a spec per bug.

### Test-environment subjects — practice apps, made to be written to

| Subject                 | URL                                                  | What it would prove                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the-internet            | <https://the-internet.herokuapp.com/>                | Its Challenging DOM, Dynamic Controls, Disappearing Elements and Shadow DOM pages are the closest thing to a purpose-built exam for the scanner's ambiguous / unreachable / no-observable-state findings |
| Sauce Demo              | <https://www.saucedemo.com/>                         | Login, so it exercises `storageState` (open item 16). Its `problem_user` and `performance_glitch_user` accounts ship deliberate defects, giving a known answer key                                       |
| Automation Exercise     | <https://automationexercise.com/>                    | A full e-commerce flow with documented API endpoints beside the UI, so UI and API coverage of one feature can be compared                                                                                |
| Basic Calculator        | <https://testsheepnz.github.io/BasicCalculator.html> | Seeded, selectable bugs. A decision-table exercise where the oracle is known, which makes it a way to score `test-design`, not just run it                                                               |
| Evil Tester AI chat bot | <https://testpages.eviltester.com/apps/ai-chat-bot/> | A non-deterministic UI. The interesting one: it breaks the assumption that the same input gives the same output, which is where `oracle-check` earns its place                                           |
| ParaBank                | <https://parabank.parasoft.com/parabank/admin.htm>   | Banking flows with both REST and SOAP, plus login and admin. The richest auth and API-contract target here                                                                                               |
| ParkCalc                | <https://www.shino.de/parkcalc/>                     | The classic date/boundary exercise. Validates `test-design/references/test-data-probes.md` against a problem with a genuinely fiddly answer                                                              |
| Polymer Shop            | <https://shop.polymer-project.org/>                  | **Web Components with real shadow DOM.** Directly targets D3 — we currently declare shadow roots as unscanned and do not traverse them                                                                   |
| QA Practice             | <https://qa-practice.razvanvancea.ro/>               | Small, purpose-built QA exercises; useful as a quick regression target for the scanner                                                                                                                   |
| Random User API         | <https://randomuser.me/>                             | Pure JSON API with nested and optional fields — a harder test of the data dictionary's nullable/optional inference than anything registered today                                                        |

### API subjects — supplied 2026-09-10

| Subject                 | URL                                                      | What it would prove                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swagger Petstore        | <https://petstore.swagger.io/>                           | **The one with a declared OpenAPI spec.** Lets us check the data dictionary we _infer_ from traffic against the contract the service _claims_. Where they disagree, either our inference is wrong or the API does not match its own spec — and both of those are findings worth having |
| RESTful Booker          | <https://restful-booker.herokuapp.com/apidoc/index.html> | Token auth plus full CRUD, and its known bugs are documented — an answer key for scoring `api-coder` rather than merely running it                                                                                                                                                     |
| PokeAPI                 | <https://pokeapi.co/>                                    | Deeply nested, heavily cross-referenced JSON with no auth. The hardest available stress test of the dictionary's depth and array-merge limits; read-only, and its fair-use policy means treat as prod                                                                                  |
| Automation Exercise API | <https://www.automationexercise.com/api_list>            | The documented API beside the UI already parked above, so one feature can be covered at both levels and the results compared                                                                                                                                                           |
| The Cat API             | <https://thecatapi.com/>                                 | Key-based auth and image payloads — a different auth shape from bearer tokens, and non-JSON responses the capture layer currently ignores                                                                                                                                              |
| GitHub Users Search     | <https://gh-users-search.netlify.app/>                   | A React app consuming a rate-limited third-party API. Two things at once: a D1 detection target, and a UI whose failures are somebody else's 403                                                                                                                                       |
| Applitools Demo         | <https://demo.applitools.com/>                           | A login page built for demo purposes; a small, stable `storageState` target                                                                                                                                                                                                            |
| QA Playground           | <https://qaplayground.dev/>                              | Modern UI challenges — dynamic content, shadow DOM, drag and drop. Same role as uitestingplayground, worth comparing which finds more scanner gaps                                                                                                                                     |

**Not a subject:** <https://pipedream.com/apps> is a directory of a few thousand API
integrations rather than something to point tests at. Its use here would be as a
_source_ of OpenAPI specs to try the contract-versus-reality check against, once
Petstore has proved that idea works.

### Production-like subjects — look, do not touch

| Subject                   | URL                                        | What it would prove                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RealWorld implementations | <https://codebase.show/projects/realworld> | **The same app built in every framework.** This is the single best answer to D1: React, Vue, Angular, Svelte and the meta-frameworks, all implementing one spec, so detection can be verified across twelve unverified detectors against a constant application |
| Bugeater                  | <https://bugeater.web.app/>                | A bug-hunting app; a read-only exploratory target                                                                                                                                                                                                               |

### Cloneable, like juice-shop

| Subject                   | Repo                                                        | Notes                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practice Software Testing | <https://github.com/testsmith-io/practice-software-testing> | Angular UI plus a documented REST API, run locally. Same shape as juice-shop but built for testing practice rather than for security training, so its defects are functional rather than exploitable |

**Clone rule, as with juice-shop:** the source stays in its own checkout outside this
repo. Only `app.config.ts`, `tests/`, `coverage.md` and a `README.md` live here, and
`sourceRepo` records where the app itself came from.

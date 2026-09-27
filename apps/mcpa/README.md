# mcpa — the unit-coder's proof-of-concept subject

An Express + MCP training app living in its own checkout beside this repository, registered
rather than vendored. `sourceRepo` on `app.config.ts` records where it is; nothing under
`src/` imports it, and never will.

**Why it is a subject.** It carries two things this repository cannot fake: a `node:test`
suite a person wrote before any agent was pointed at it, and a mutation script covering its
routes and MCP server that predates this experiment and was not written to flatter it. The
search index is the unit the first run targets.

**What it is not.** Not ours, and not a fixture. Never edit its own checkout, never inherit
its environment file, and never treat a green suite there as evidence about this harness.

**The stack comes from its config, not from prose.** `testStack` on `app.config.ts` holds the
runner, the command that runs everything, the command that runs one file, where tests live,
the module system, how assertions are imported, and one file to read as the house style. A
role composes its knowledge from those fields instead of assuming this repository's
Playwright.

**Orientation before a run.** `npm run survey -- src` maps the subject's own source with the
reverse edges; `npm run candidates -- src/services/searchIndex.js` lists which of its units a
unit test could pin and which no test names. Both read the subject, not this repository —
point them at its checkout.

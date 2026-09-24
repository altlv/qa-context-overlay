import type { AppConfig } from '../app-config.js';

/**
 * MCPA training bot — an Express + MCP study app living in its own checkout beside this
 * one. It is the unit-coder's proof-of-concept subject, and it is `external`: we do not
 * own it, nothing in `src/` imports it, and the work a run produces comes back as an
 * uncommitted diff in a worktree of *that* repository.
 *
 * Chosen because it has things this repo cannot fake: a `node:test` suite a person wrote
 * before an agent was ever pointed at it, and `scripts/mutate-app.mjs` — a mutation set
 * written for its routes and MCP server, which predates this experiment and was not built
 * to flatter it.
 */
const config: AppConfig = {
  name: 'mcpa',
  description:
    'MCPA certification trainer: Express routes, an MCP server, and a BM25 search index over questions and specs. Kept in its own repository, pointed at rather than vendored.',
  environments: {
    local: {
      baseURL: 'http://127.0.0.1:3000',
      // No `webServer`: Playwright would run the command from this repository, where
      // `npm start` starts nothing. The subject starts itself from its own checkout, and
      // a unit run needs no server at all.
      note: 'Start it in the subject checkout: npm start (PORT defaults to 3000).',
    },
  },
  defaultEnvironment: 'local',
  external: true,
  // Relative to this repository's root. A sibling rather than an absolute path, because
  // this repository is public and a checkout location with a user name in it does not
  // belong in a tracked file.
  sourceRepo: '../mcpa-training-bot',
  sourceRoot: 'src',
  testStack: {
    runner: 'node --test',
    runAll: 'node --test test/*.test.js',
    runOne: 'node --test ',
    testsDir: 'test',
    testFilePattern: '*.test.js',
    moduleSystem: 'commonjs',
    assertions: "const assert = require('node:assert/strict');",
    exemplar: 'test/specIndexer.test.js',
  },
};

export default config;

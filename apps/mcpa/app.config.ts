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
      // `npm start` starts nothing.
      //
      // And no server needs starting by hand either, which is worth saying because this
      // note used to tell a person to. A unit run needs no server. An integration test
      // starts the app **itself**, through its real entry point on a port the OS hands
      // out — `spawn(process.execPath, ['src/server.js'])` with PORT in its environment —
      // which is what owning the lifecycle means: no collision between two runs, and the
      // entry point under test rather than assumed to be up.
      //
      // The one shared port is the weather lab's 3001, pinned by the subject's registry
      // rather than chosen by a test, so a lab left listening from an earlier run is
      // reused rather than replaced.
      note:
        'Nothing to start by hand: a unit run needs no server, and an integration test spawns ' +
        'src/server.js on an OS-assigned port itself. Only a browser run against this baseURL ' +
        'needs `npm start` in the subject checkout.',
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
    // `node:test` has no xfail, so `todo` is the nearest honest thing: the test runs, its
    // failure is not counted against the suite, and the reason travels with it. This is the
    // slot the crash L6.4 found had nowhere to go — see `src/qe/known-defect.ts`.
    //
    // **And it is the weaker of the two idioms.** Measured 2026-10-03: a `todo` that starts
    // passing — the defect got fixed — produces no complaint and exit 0, where vitest's
    // `it.fails` would report a failure. So on this subject a stale marker is invisible to the
    // runner, and the only thing that keeps it visible is `known-defect-check` printing the
    // count on every gate run.
    knownDefect: "it('…', { todo: 'KNOWN: <what is broken>' }, async () => {});",
    knownDefectPattern: '\\btodo:\\s*[\'"`]',
  },
  entryPoint: 'src/server.js',
  mutations: {
    set: 'apps/mcpa/mutations/labs-routes.ts',
    baseline: 'test/labs-routes.test.js',
  },
  /**
   * The three protocol labs, compiled.
   *
   * `test/labs-routes.test.js` starts labs over HTTP and asserts 200, and each lab is a
   * TypeScript project whose `build/` is gitignored — 0 build files are tracked. So the
   * suite passes 11 of 11 in the prepared checkout and is red in a bare worktree, which
   * would score every mutation as caught.
   *
   * `npm install` before `npm run build` because the labs are not part of the subject's
   * root install, and each has its own `tsc`.
   */
  prepare: [
    { in: 'labs/weather-modern', run: 'npm install --no-audit --no-fund && npm run build' },
    { in: 'labs/oauth-local', run: 'npm install --no-audit --no-fund && npm run build' },
    { in: 'labs/gmail-draft', run: 'npm install --no-audit --no-fund && npm run build' },
  ],
};

export default config;

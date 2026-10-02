import type { AppConfig } from '../app-config.js';

/**
 * A retrieval-augmented question answerer over the Angular docs — an Express server, a
 * vector store, a reranker and several LLM providers behind one API.
 *
 * Chosen as the second coder subject because it differs from `mcpa` in the ways that
 * matter to the harness rather than to the product. Its suite runs under **vitest**, and
 * every check that reads a subject's own stack — the gate running a changed test, the
 * assertion floor, the process fault — has until now only ever faced `node --test`. A
 * `TestStack` that is honoured rather than assumed cannot be shown to work by a subject
 * that agrees with the assumption.
 *
 * It also has a dependency that is not deterministic, which is the case
 * `integration-testing` devotes a section to and which no run has exercised.
 */
const config: AppConfig = {
  name: 'coursera-rag',
  description:
    'RAG over the Angular documentation: an Express API, an OpenAI-backed vector store, a reranker, an injection guard and a rate limiter.',
  environments: {
    local: {
      baseURL: 'http://127.0.0.1:3000',
      // No `webServer`, for the reason `mcpa` records: Playwright would run the command
      // from this repository, where it starts nothing. An integration test spawns
      // `server/index.js` itself.
      note:
        'Nothing to start by hand for a unit or integration run — a test spawns server/index.js on ' +
        'its own port. A browser run against this baseURL needs `npm start` in the subject checkout.',
    },
  },
  defaultEnvironment: 'local',
  external: true,
  sourceRepo: '../coursera-rag',
  sourceRoot: 'server',
  /**
   * `server/index.js` listens unconditionally, and the OpenAI key is demanded per request
   * by `embedQuery` rather than at startup. So the process starts without credentials and
   * every seam that does not reach the model — the rate limiter, the injection guard, the
   * API pairing, provider health — is testable without any, which is what makes this
   * subject usable at all in a run that holds no keys.
   */
  entryPoint: 'server/index.js',
  testStack: {
    runner: 'npx vitest run',
    runAll: 'npx vitest run',
    runOne: 'npx vitest run ',
    testsDir: 'test',
    // The vitest config includes `test/**/*.test.mjs`; the pattern is written the same way
    // so the gate and the source map agree with the runner about what a test is.
    testFilePattern: 'test/**/*.test.mjs',
    moduleSystem: 'esm',
    assertions: "import { describe, it, expect } from 'vitest';",
    exemplar: 'test/unit/rate-limit.test.mjs',
    // vitest's own marker. The test is written as it should pass; vitest reports it as an
    // expected failure and fails loudly if the subject is ever fixed.
    knownDefect: "it.fails('…', () => { /* KNOWN: <what is broken> */ });",
    knownDefectPattern: '\\b(?:it|test)\\.fails\\s*\\(',
  },
  /**
   * The rate limiter, because it is the only seam here that is pure, has its clock injected
   * and needs no API key — so a mutation run costs nothing and cannot be confounded by a
   * live model. Its own suite is the bar; see the set for why each rule is in it.
   */
  mutations: {
    set: 'apps/coursera-rag/mutations/rate-limit.ts',
    baseline: 'test/unit/rate-limit.test.mjs',
  },
  /**
   * The runner itself. `vitest` is a devDependency and `vitest.config.mjs` imports
   * `vitest/config`, so in a bare worktree the suite does not fail — it cannot start, and
   * `npx` then fetches a vitest that resolves nothing.
   *
   * This is why the mutation and process-fault steps had never run successfully against
   * this subject, and the diagnosis was slower than it should have been because both
   * report the same thing an honestly red suite reports. Reproduced by hand in the
   * subject's own checkout on 2026-09-30: `npx vitest run test/unit/rate-limit.test.mjs`
   * → ERR_MODULE_NOT_FOUND for `vitest`, with no `node_modules` present. The first live
   * run was green only because the agent happened to install before writing.
   *
   * It costs an Angular-sized install per worktree, and that is the price of a worktree
   * holding only what git tracks. A run judged without it scores every mutation as caught.
   */
  prepare: [{ in: '.', run: 'npm install --no-audit --no-fund' }],
};

export default config;

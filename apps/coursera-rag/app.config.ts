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
  },
};

export default config;

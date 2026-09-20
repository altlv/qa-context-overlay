import type { AppConfig } from '../app-config.js';

const config: AppConfig = {
  name: 'eprimer',
  description:
    "The eprimer target from the Exploratory Testing Academy's capture-the-bugs collection: a small app seeded with defects on purpose, used here as the first subject a session is allowed to interact with rather than only read.",
  environments: {
    // `test` rather than `prod`, and the distinction is real rather than flattering.
    // This is a static page on GitHub Pages with no server state and no other user's
    // data behind it, so a session that types, submits and resets can do nothing worse
    // than change what its own browser holds. Calling it `prod` would buy no safety and
    // cost the interaction the whole subject exists to allow.
    //
    // The URL points at the **inner app**, not the collection's shell page. The shell
    // loads each target into an iframe: scanned directly it reports one control and one
    // unexamined frame, which reads as a nearly empty, clean page — the exact blind
    // spot `docs/definition-of-done.md` names in its own example.
    test: {
      baseURL:
        'https://exploratory-testing-academy.github.io/capture-the-bugs/targets/eprimer/app/',
    },
  },
  defaultEnvironment: 'test',
  scanScope: 'body',
  external: true,
  sourceRepo: 'https://github.com/exploratory-testing-academy/capture-the-bugs',
};

export default config;

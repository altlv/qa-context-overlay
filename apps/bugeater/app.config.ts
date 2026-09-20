import type { AppConfig } from '../app-config.js';

const config: AppConfig = {
  name: 'bugeater',
  description:
    'The BugEater QA challenge from jLogic Software: a timed bug hunt against a to-do list app. Registered as the first subject with server state, an identity and more than one screen — every earlier subject was a single static page, so the state model, the action ceiling and the lock have never met the conditions they were built for.',
  environments: {
    // `test` for the same reason as eprimer: a practice target built to be broken.
    // Unlike eprimer it is NOT stateless — it is a React SPA on Firebase that takes a
    // chosen name, starts a timer and keeps data for three days. That is a real
    // difference and the reason the charter, not the tier, is what bounds this run.
    test: { baseURL: 'https://bugeater.web.app/game/todo-list' },
  },
  defaultEnvironment: 'test',
  scanScope: 'body',
  external: true,
  sourceRepo: 'https://bugeater.web.app',
};

export default config;

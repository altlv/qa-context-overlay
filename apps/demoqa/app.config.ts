import type { AppConfig } from '../app-config.js';

/**
 * DemoQA — a practice site whose pages are each built around one widget family.
 *
 * Registered for the reason it was **parked** for. `apps/README.md` held it under
 * "demoqa browser-windows … the `unscanned-frame` finding, and whether the scan should follow a
 * frame rather than only declare it", and as of 2026-10-02 the scan does follow one:
 * `src/tools/frames.ts` reads every child document and `src/tools/aria.ts` reads the browser's
 * own view of what is operable. Both were proven on fixtures, and **neither had a live subject
 * with a frame in it** — every registered subject probed had none. This is that subject.
 *
 * What makes it worth the slot rather than merely available:
 *
 * - `/frames` and `/nestedframes` are iframes on purpose, including one nested inside another,
 *   which is the case `page.frames()` flattens and nothing here has exercised.
 * - `/select-menu` and `/menu` are React widgets whose options are `role=option` and
 *   `role=combobox` — exactly the roles measured invisible to the twelve-selector sweep and
 *   recovered by the accessibility tree.
 * - `/alerts`, `/modal-dialogs` and `/dynamic-properties` are announcements and transient
 *   surfaces, which is the blindness still open as item 4.
 *
 * **Ads are not the subject.** The site serves third-party advertising in frames of its own, so
 * a frame reading here will include documents nobody wrote for testing. They are reported like
 * any other frame rather than filtered: a filter would be a list of plausible ad hosts, which is
 * the same assumption-until-contradicted shape this whole layer has been correcting. No
 * `extraHosts` is declared, so the guards still refuse acting on an ad origin — the frames are
 * read, not operated.
 */
const config: AppConfig = {
  name: 'demoqa',
  description:
    'DemoQA practice site: one widget family per page — frames and nested frames, React select menus, alerts, modals and dynamic properties. Registered as the first subject with iframes a session can actually look inside.',
  environments: {
    /**
     * `test` rather than `prod`, on the same reasoning eprimer records and for the same
     * conditions: a public practice site with no account, no other person's data behind it and
     * nothing a session can spend. Interacting is the point of the subject, and calling it
     * `prod` would buy no safety while costing the interaction.
     */
    test: {
      baseURL: 'https://demoqa.com',
      note:
        'Pages are per-widget: /frames and /nestedframes for iframes, /select-menu and /menu for ' +
        'React widgets, /alerts and /modal-dialogs for announcements. Third-party ads load in ' +
        'frames of their own and are reported, not filtered — they are not the subject.',
    },
  },
  defaultEnvironment: 'test',
  external: true,
  sourceRepo: 'https://demoqa.com',
};

export default config;

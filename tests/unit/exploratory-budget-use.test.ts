import { test, expect } from '@playwright/test';
import { exploratoryTester } from '../../src/agents/roles/exploratory-tester.js';

/**
 * Five amendments, each bought with a measured session. They are pinned here because
 * every one of them corrects a failure the prompt read perfectly well without.
 *
 * The runs: two sessions against the same storefront, 746s/68 calls and 779s/63 calls,
 * both stopping at roughly 13 minutes of a 45-minute timebox with no budget cutting
 * either off, and 14 and 9 defect claims between them.
 */

const prompt = exploratoryTester.prompt as string;

test.describe('what the prompt must keep telling a session', () => {
  test('should hand it a measured clock and forbid estimating one', () => {
    // Both sessions called "date" once, at tool call #1, and invented every timestamp
    // after it. One closed claiming "~37 minutes of the 45" at a real elapsed of 779s.
    expect(prompt).toContain('SESSION CLOCK');
    expect(prompt).toContain('never estimate it');
  });

  test('should treat the budget as a floor to spend, not a ceiling to avoid', () => {
    // 135 turns and 88 actions unspent, twice. The only stopping guidance the prompt
    // used to carry was "when it runs low, stop", which nothing contradicted.
    expect(prompt).toContain('floor to spend, not a ceiling to avoid');
    expect(prompt).toMatch(/enough findings/i);
  });

  test('should require one bulk markup harvest before interacting', () => {
    // Seven of one run's fourteen findings came from a single pass like this. The
    // other run never made one, and the prompt never asked for it.
    expect(prompt).toContain('harvest the markup in bulk');
    expect(prompt).toMatch(/empty src/i);
  });

  test('should name the URL as an input surface', () => {
    // Two findings came from nothing but editing the address bar; the dimension list
    // said "UI, API, import and export, logs, queues" and stopped there.
    expect(prompt).toContain('the URL itself');
    expect(prompt).toMatch(/query parameter/i);
  });

  test('should make a surprising measurement suspect the instrument first', () => {
    // A run reported 25 invisible-but-tabbable elements from a filter ignoring
    // visibility:hidden (true count: zero), and an occlusion defect from a selector
    // matching an 800x5269 page-wide wrapper. Both retracted, both paid for in full.
    expect(prompt).toContain('claim about your instrument');
    expect(prompt).toContain('visibility:hidden');
  });

  test('should NOT tell it to open its skills, because they are already inlined', () => {
    // This file asserted the opposite for exactly one run. composeSystemPrompt inlines
    // the full text of every declared skill and the composed prompt then says "it is
    // already here — do not spend a turn reading its SKILL.md". An instruction to open
    // them is a live contradiction, the same class of fault that cost 4 turns and
    // $0.26 in the browser briefing.
    expect(prompt).not.toContain('Open the skills before you start');
  });
});

test.describe('measuring whether the inlined skills change anything', () => {
  test('should require every finding to declare what produced it', () => {
    // 21k tokens of skill text reach every session and nothing could tell whether any
    // of it landed — using a skill costs no tool call, so no ledger of calls sees it.
    expect(prompt).toContain('Say what found each finding');
    expect(prompt).toContain('"method"');
  });

  test('should ask for the method used, not the one that sounds best', () => {
    // The field is a measurement. A tidied answer destroys the only reading of it
    // there is, so the prompt makes "noticed it while doing something else" legitimate.
    expect(prompt).toContain('never\n   the one that sounds best');
    expect(prompt).toMatch(/Noticed it while doing something else/i);
  });
});

test.describe('what the session is actually for', () => {
  test('should define the job as uncovering and classifying, not finishing', () => {
    // The clock stopped the fabricated early close. It did not stop the voluntary
    // one: the next run still closed with 19 minutes left. Time was never the real
    // frame — a session ends when the product stops telling it things it did not know.
    expect(prompt).toContain('uncover information, and to classify what you uncover');
    expect(prompt).toContain('A session ends on');
    expect(prompt).toContain('information, never on tidiness');
  });

  test('should replace "have I got enough" with a question that can be answered', () => {
    // You cannot know what enough is: the thing being counted is the thing not yet
    // found. What a session can answer is where its last surprise pointed.
    expect(prompt).toMatch(/when did I last learn something, and where did it point/i);
    expect(prompt).toContain('avoiding the lead');
  });

  test('should make classification half the work, not filing', () => {
    // An unplaced finding is an anecdote, and an anecdote cannot be acted on,
    // argued for, or counted.
    expect(prompt).toContain('Classification is half the work');
    expect(prompt).toMatch(/is an anecdote/i);
  });
});

test.describe('breadth, against the pull of depth', () => {
  test('should counterweight "bugs cluster" with a return to the survey', () => {
    // True per-session economics, wrong across sessions: the cheap second defect in
    // an area is the one the next run finds anyway. Five sessions on one target
    // reached 39% of the union at best, and 31 of 57 findings were seen exactly once.
    expect(prompt).toContain('take a territory you have not touched');
    expect(prompt).toContain('not the whole story');
  });

  test('should say the singletons cluster by territory, not by luck', () => {
    expect(prompt).toContain('not luck');
    expect(prompt).toMatch(/none of them crossed/i);
  });
});

test.describe('the unexpected as the founding expectation', () => {
  test('should frame the unexpected as the point, not as an interruption', () => {
    // The predicted behaviours are checked by somebody cheaper. What is left is what
    // nobody thought of, and it does not arrive by waiting attentively.
    expect(prompt).toContain('It is what you are for');
    expect(prompt).toContain('what would have to be true for this to');
  });

  test('should name assumptions about normal input as the largest blind spot', () => {
    expect(prompt).toContain('largest unexamined thing you carry');
    expect(prompt).toMatch(/what is the\s+version of this I have not imagined/);
  });

  test('should treat a clean sweep as a claim that owes an oracle', () => {
    // This file asserted "never once left ASCII" for exactly one commit, and it was
    // false. The session had swept locale properly — precomposed and combining
    // accents, German sz, CJK, Arabic RTL, emoji, a combining mark inside a target
    // word — and reported it clean. The target's key says three high-impact defects
    // live exactly there. One of the two is wrong, and the report cannot say which,
    // because a clean sweep was recorded as a result and not as a disagreement.
    expect(prompt).toContain('that clean result is a claim too');
    expect(prompt).toMatch(/a sweep\s+that cannot fail is a sweep that proves nothing/);
  });
});

test.describe('reading the product before ranking the work', () => {
  test('should require working out what a catastrophe would be for this product', () => {
    expect(prompt).toContain('what would be a catastrophe for it');
    expect(prompt).toContain('most\n   appalled to learn');
  });

  test('should say the criteria list is fixed and the ranking is not', () => {
    // A storefront dies on money being wrong; a text parser on mis-reading a
    // language. Same criteria, different order, and the order is the decision.
    expect(prompt).toContain('the ranking is not');
    expect(prompt).toMatch(/Different products value different things/);
  });

  test('should make a wrong ranking something the session has to admit', () => {
    expect(prompt).toContain('you chose badly and should say so');
  });

  test('should blame not ranking rather than ranking wrongly', () => {
    // The same session ranked security worth probing on a tool with no backend, and
    // that apparently unpromising choice produced a real seeded defect. An earlier
    // version of this prompt cited it as budget wasted, which was simply untrue.
    expect(prompt).toContain('Ranking badly is not the');
    expect(prompt).toMatch(/habit\s+runs the same sweep against a bank and a spellchecker/);
  });
});

test.describe('magnification as an oracle', () => {
  test('should treat zoom as an instrument, not only as a thing that might break', () => {
    // The skill had zoom-to-50% as a state-forcer — "exposes absolutely-positioned
    // elements parked outside the viewport". The larger use is seeing shape at all.
    expect(prompt).toContain('Magnification is an oracle');
    expect(prompt).toContain('as an instrument, not only as a thing to check');
  });

  test('should say low magnification is how shape becomes visible', () => {
    // Seven missed defects were an offset output box, an output too far left, mixed
    // typefaces, a font whose l and I are identical, wasted whitespace, an oversized
    // banner and an input below its own output. None of them is a number.
    expect(prompt).toContain('the detail drops out while the pattern arrives');
    expect(prompt).toMatch(/none of them is a number/);
  });

  test('should generalise magnification past the browser to any evidence stream', () => {
    // A log line by line is zoomed all the way in; the same log as counts per minute
    // is zoomed out, and only one shows that errors arrive in bursts of exactly five.
    expect(prompt).toContain('Every\nevidence stream has a magnification');
    expect(prompt).toContain('suspect the magnification before you');
  });
});

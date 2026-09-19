import { test, expect } from '@playwright/test';
import { archiveName, prune } from '../../src/qe/run-history.js';

/**
 * A run history is only worth keeping if one run means one name and a prune deletes only
 * what it recognises. Both halves are pinned here: a name taken from the clock would
 * duplicate a run, and a prune that trusted file metadata or guessed at unknown names
 * would delete the wrong thing — or nothing, which looks just as plausible.
 */

const START = '2026-09-19T07:30:15.386Z';
const START_NAME = '2026-09-19T07-30-15-386Z.json';

const oldest = archiveName('2026-09-19T07:30:00.000Z');
const middle = archiveName('2026-09-20T07:30:00.000Z');
const newest = archiveName('2026-09-21T07:30:00.000Z');

/**
 * Names a real directory holds that are not ours: a stray note, an editor backup of an
 * archive, an archive with the milliseconds dropped, and a stamp whose shape is right
 * but whose numbers are not a real date.
 */
const foreign = [
  'notes.txt',
  '.gitkeep',
  'results.json',
  'runs',
  `${oldest}.bak`,
  '2026-09-19T07-30-15-386.json',
  '2026-13-45T07-30-15-386Z.json',
];

test.describe('naming an archived run', () => {
  test('should name a run after its own start time, with no colon, when given that start', () => {
    expect(
      archiveName(START),
      'the name must encode the run’s own start time (R1) in a form Windows can create (R2)',
    ).toBe(START_NAME);
    expect(
      archiveName(START),
      'a colon makes the archive impossible to create on Windows, so R2 exists',
    ).not.toContain(':');
    expect(
      START.includes(':'),
      'the fixture must contain the colons R2 strips, or this test proves nothing',
    ).toBe(true);
  });

  test('should produce one name for one run, however many times it is asked', () => {
    expect(
      archiveName(START),
      'archiving the same results file twice must not create two entries for one run (R1)',
    ).toBe(archiveName(START));
    expect(
      archiveName(START),
      'a name from the clock instead of from the report would not be the run’s start time (R1)',
    ).not.toBe(archiveName('2026-09-21T07:30:00.000Z'));
  });

  test('should name one instant one way, whatever spelling of it arrives', () => {
    expect(
      archiveName('2026-09-19T07:30:15.386Z'),
      'the same instant written two ways is one run, so it must be one filename (R1)',
    ).toBe(archiveName('2026-09-19T08:30:15.386+01:00'));
  });

  test('should refuse a start time that is not a time, rather than invent one', () => {
    expect(
      () => archiveName('sometime last Tuesday'),
      'guessing a name for an unreadable stamp would archive a run under a made-up date',
    ).toThrow();
    expect(
      () => archiveName(''),
      'an empty stamp is not the current time, and must not silently become it (R1)',
    ).toThrow();
  });
});

test.describe('pruning the archive', () => {
  test('should rank runs by the timestamp in the name, not by their order in the list', () => {
    // The array is deliberately in no order at all: only the names say which is newest.
    expect(
      prune([middle, oldest, newest], 1).keep,
      'mtime lies after a copy, so pruning must read the timestamp out of the name (R3)',
    ).toEqual([newest]);
    expect(
      prune([middle, oldest, newest], 1).remove,
      'the two runs that are not the newest are the two that age out (R3)',
    ).toEqual([middle, oldest]);
    expect(
      prune([oldest, middle, newest], 1).keep,
      'ascending input order must not change which run is called newest (R3)',
    ).toEqual([newest]);
    expect(
      prune([middle, oldest, newest], 2).keep,
      'the survivors come back newest first, so the order is the history’s, not the listing’s',
    ).toEqual([newest, middle]);
  });

  test('should remove nothing when the count covers every run it recognises', () => {
    expect(
      prune([newest, middle, oldest], 3).remove,
      'a count equal to the number of runs must delete nothing, or a full history would erode (R4)',
    ).toEqual([]);
    expect(
      prune([newest, middle, oldest], 99).remove,
      'a count above the number of runs is the same case, not an error (R4)',
    ).toEqual([]);
    expect(
      prune([newest, middle, oldest], 99).keep,
      'nothing removed means every run is kept, newest first (R4)',
    ).toEqual([newest, middle, oldest]);
    expect(
      prune([newest, middle, oldest], 2).remove,
      'one below the number of runs must still remove something, or the test above proves nothing (R4)',
    ).toEqual([oldest]);
  });

  test('should keep nothing, without throwing, when the count is zero or negative', () => {
    expect(
      prune([newest, middle, oldest], 0).keep,
      'zero means keep nothing; a filter that keeps everything here looks plausible (R5)',
    ).toEqual([]);
    expect(
      prune([newest, middle, oldest], 0).remove,
      'zero must remove every run it recognised, not all but the last few (R5)',
    ).toEqual([newest, middle, oldest]);
    expect(
      prune([newest, middle, oldest], -5).remove,
      'a negative count is a caller bug, but it must remove all rather than keep all (R5)',
    ).toEqual([newest, middle, oldest]);
    // -5 against three runs cannot tell a clamped count from an unclamped one: both
    // slice(0, -5) and slice(-5) happen to give the right answer once the magnitude
    // overruns the array. -1 is the case that separates them — unclamped it keeps two
    // and removes one. Found by mutating Math.max(0, ...) away and watching this test
    // stay green.
    expect(
      prune([newest, middle, oldest], -1),
      'a negative count smaller than the archive is where an unclamped slice quietly keeps runs it was told to drop (R5)',
    ).toEqual({ keep: [], remove: [newest, middle, oldest] });
    expect(
      () => prune([newest, middle, oldest], -5),
      'R5 is explicit: a negative count must not throw, because the CLI would then die mid-prune',
    ).not.toThrow();
    expect(
      prune([newest, middle, oldest], 1).remove,
      'a count of one must remove the rest, which is what makes zero the boundary and not a no-op (R5)',
    ).toEqual([middle, oldest]);
  });

  test('should keep, and never remove, a file whose name is not an archive name', () => {
    const existing = [middle, ...foreign, newest, oldest];
    const pruned = prune(existing, 1);

    expect(
      pruned.remove,
      'only the archive names it recognised age out; an unrecognised file is never removed (R6)',
    ).toEqual([middle, oldest]);
    expect(
      pruned.keep,
      'the newest run that survives is the one named newest, so the recognised set was read correctly (R6)',
    ).toEqual([newest]);

    for (const name of foreign) {
      expect(
        pruned.remove,
        `${name} is not an archive this harness wrote, so deleting it would destroy someone else's file (R6)`,
      ).not.toContain(name);
      expect(
        pruned.keep,
        `${name} is not part of the history being counted, so it is in neither list (R6)`,
      ).not.toContain(name);
    }
  });

  test('should report an empty directory as nothing kept and nothing removed', () => {
    expect(
      prune([], 3),
      'a first run has no history yet, so nothing may be kept or offered for deletion',
    ).toEqual({ keep: [], remove: [] });
    expect(
      prune([], 0),
      'an empty directory under a zero count is still empty, not an error (R5)',
    ).toEqual({ keep: [], remove: [] });
  });

  test('should remove nothing when every file in the directory is unrecognised', () => {
    expect(
      prune(foreign, 0).remove,
      'keeping nothing is not a licence to delete files the harness did not write (R5, R6)',
    ).toEqual([]);
    expect(
      prune(foreign, 0).keep,
      'unrecognised files are not kept either: they are simply not ours to report on (R6)',
    ).toEqual([]);
  });
});

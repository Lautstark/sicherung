import { describe, expect, it, vi } from 'vitest';
import { actionsFor, ago, lineFor, needsAttention, type Actor } from '../src/ui.js';
import type { Status } from '../src/types.js';

/*
 * The table three products had each written out, and the arithmetic beside it.
 *
 * These exist because the table is a behavioural contract that had three
 * copies and nothing asserting they agreed — the state in which one of them
 * quietly stops offering a way out of `failed` and nobody finds out until
 * somebody's disk is full. Asserting it once is the whole point of moving it.
 *
 * Nothing here touches a folder or a store: this module is a lookup and a
 * calculation, and it is tested as one.
 */

/** Records which method a panel would have called, without doing anything. */
function spy(): Actor & { calls: string[] } {
  const calls: string[] = [];
  const stub = (name: string) => async () => { calls.push(name); return { kind: 'off' } as Status; };
  return {
    calls,
    choose: stub('choose'), confirm: stub('confirm'), confirmEmpty: stub('confirmEmpty'),
    save: stub('save'), forget: stub('forget'),
  };
}

const withFolder = { folder: 'Sicherungen', lastWrite: null };

describe('what to offer in each state', () => {
  it('offers a way to start when nothing is set up', () => {
    const actions = actionsFor(spy(), { kind: 'off' });
    expect(actions.map((a) => a.id)).toEqual(['choose']);
    expect(actions[0]!.primary).toBe(true);
  });

  it('leads with confirming when the browser wants the folder re-confirmed', () => {
    const actions = actionsFor(spy(), { kind: 'needs-permission', ...withFolder });
    expect(actions.map((a) => a.id)).toEqual(['confirm', 'forget']);
    expect(actions.map((a) => a.primary)).toEqual([true, false]);
  });

  it('keeps a way out beside the retry when writing failed', () => {
    // Retry alone would corner somebody whose disk is full: the folder they
    // chose may be exactly the thing they now want to be rid of.
    const actions = actionsFor(spy(), { kind: 'failed', ...withFolder, reason: 'Datenbank zu' });
    expect(actions.map((a) => a.id)).toEqual(['retry', 'forget']);
  });

  it('offers only forgetting once it is working', () => {
    expect(actionsFor(spy(), { kind: 'idle', ...withFolder }).map((a) => a.id)).toEqual(['forget']);
  });

  it('offers nothing mid-write, and nothing where there is no picker', () => {
    // A write settles in under a second. A button that appears for that long
    // is one people learn to distrust rather than one they use.
    expect(actionsFor(spy(), { kind: 'saving', ...withFolder })).toEqual([]);
    expect(actionsFor(spy(), { kind: 'unsupported' })).toEqual([]);
  });

  it('never makes forgetting the leading action', () => {
    const kinds: Status[] = [
      { kind: 'off' }, { kind: 'idle', ...withFolder },
      { kind: 'needs-permission', ...withFolder },
      { kind: 'failed', ...withFolder, reason: 'x' },
    ];
    for (const status of kinds) {
      const forget = actionsFor(spy(), status).find((a) => a.id === 'forget');
      expect(forget?.primary ?? false).toBe(false);
    }
  });

  it('carries no words, only keys', () => {
    // The reason this module can be shared at all: bildhaft has no t(), so
    // anything here that read as a label would force one on it.
    const actions = actionsFor(spy(), { kind: 'failed', ...withFolder, reason: 'Datenbank zu' });
    for (const action of actions)
      expect(Object.keys(action).sort()).toEqual(['id', 'primary', 'run']);
  });
});

describe('running an action', () => {
  it('calls the method that state calls for, and nothing else', async () => {
    for (const [status, expected] of [
      [{ kind: 'off' }, 'choose'],
      [{ kind: 'needs-permission', ...withFolder }, 'confirm'],
      [{ kind: 'failed', ...withFolder, reason: 'x' }, 'save'],
    ] as [Status, string][]) {
      const actor = spy();
      await actionsFor(actor, status)[0]!.run();
      expect(actor.calls).toEqual([expected]);
    }
  });
});

describe('how long ago the last copy was', () => {
  const at = Date.parse('2026-08-23T10:00:00Z');

  it('changes unit at each boundary', () => {
    const de = (gap: number) => ago(at, 'de', at + gap);
    expect(de(30_000)).toMatch(/Sekunden/);
    expect(de(5 * 60_000)).toMatch(/Minuten/);
    expect(de(5 * 3_600_000)).toMatch(/Stunden/);
    expect(de(3 * 86_400_000)).toMatch(/Tagen/);
    expect(de(3 * 604_800_000)).toMatch(/Wochen/);
    expect(de(400 * 86_400_000)).toMatch(/Monaten/);
  });

  it('answers in the language it is asked in, every time', () => {
    // The regression this guards: a cached formatter keeps answering in the
    // language the reader has just left. mitreden changes language without a
    // reload, so the second call here is the one that matters — and a cached
    // formatter would still return well-formed German and pass a laxer test.
    expect(ago(at, 'de', at + 5 * 60_000)).toMatch(/vor 5 Minuten/);
    expect(ago(at, 'en', at + 5 * 60_000)).toMatch(/5 minutes ago/);
    expect(ago(at, 'de', at + 5 * 60_000)).toMatch(/vor 5 Minuten/);
  });

  it('does not build a copy that is dated in the future', () => {
    // Clocks disagree by seconds across a sync, and "in 3 seconds" is
    // alarming out of all proportion to a skewed clock.
    expect(ago(at, 'de', at - 3000)).toBe(ago(at, 'de', at));
  });

  it('reads the clock itself when not told one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at + 5 * 60_000);
    try {
      expect(ago(at, 'de')).toMatch(/vor 5 Minuten/);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* Which states are somebody's to act on.
 *
 * The table is small and the temptation is to leave it untested. The reason it
 * is in this package at all is that three products each decided it for
 * themselves and all three got `needs-permission` wrong - drawn as prose,
 * beside the states that mean it is working. A test is what makes the answer
 * one thing rather than four.
 */
describe('needsAttention', () => {
  it('is true where nothing is being written and it will not resume alone', () => {
    expect(needsAttention({ kind: 'needs-permission', folder: 'S', lastWrite: 1 })).toBe(true);
    expect(needsAttention({ kind: 'failed', folder: 'S', lastWrite: 1, reason: 'voll' })).toBe(true);
  });

  it('is false where it is working, or where nothing has been asked for yet', () => {
    expect(needsAttention({ kind: 'idle', folder: 'S', lastWrite: 1 })).toBe(false);
    expect(needsAttention({ kind: 'saving', folder: 'S', lastWrite: 1 })).toBe(false);
    // Nobody has chosen a folder: nothing is broken and nothing is owed.
    expect(needsAttention({ kind: 'off' })).toBe(false);
    // And a browser with no picker should not be drawing the panel at all.
    expect(needsAttention({ kind: 'unsupported' })).toBe(false);
  });

  /* The pair that has to stay in step: anything needing attention has to offer
   * a way out of it, or a panel says something is wrong and hands nobody a
   * button. */
  it('always comes with something to press', () => {
    const backup: Actor = {
      choose: async () => ({ kind: 'off' }),
      confirm: async () => ({ kind: 'off' }),
      confirmEmpty: async () => ({ kind: 'off' }),
      save: async () => ({ kind: 'off' }),
      forget: async () => ({ kind: 'off' }),
    };
    const states: Status[] = [
      { kind: 'needs-permission', folder: 'S', lastWrite: null },
      { kind: 'failed', folder: 'S', lastWrite: null, reason: 'voll' },
      // Held is the newest of these and the easiest to leave out: it is the one
      // that is not about the folder, so a panel written around folder trouble
      // would never think to draw it.
      { kind: 'held', folder: 'S', lastWrite: null },
    ];
    for (const status of states) {
      expect(needsAttention(status)).toBe(true);
      expect(actionsFor(backup, status).length).toBeGreaterThan(0);
    }
  });
});

/*
 * The line each state asks for.
 *
 * Same reason as the table above: three products held this switch, all three
 * agreed on its shape, and nothing was checking that they still did. What is
 * asserted here is the shape - which arms exist, which carry a folder or a
 * reason, and which carry an age - because that is the half that was being
 * kept in step by hand. The words stay the products'.
 */
describe('what the line says in each state', () => {
  it('has nothing to say where there is no picker', () => {
    expect(lineFor({ kind: 'unsupported' })).toEqual({ key: 'none' });
  });

  it('names no folder before one is chosen', () => {
    expect(lineFor({ kind: 'off' })).toEqual({ key: 'off' });
  });

  /* Splits, because "never saved" is its own sentence rather than an age
     phrase inside one - so no product has to render an empty age. */
  it('splits idle on whether anything has ever been written', () => {
    expect(lineFor({ kind: 'idle', folder: 'Sicherung', lastWrite: null }))
      .toEqual({ key: 'idle-never', folder: 'Sicherung' });
    expect(lineFor({ kind: 'idle', folder: 'Sicherung', lastWrite: 1000 }))
      .toEqual({ key: 'idle', folder: 'Sicherung', lastWrite: 1000 });
  });

  /* These three keep the null instead, because there the age is a clause
     inside the sentence and the product's wording decides how it reads. */
  it('carries the age, null and all, for the three that report one', () => {
    expect(lineFor({ kind: 'needs-permission', folder: 'S', lastWrite: null }))
      .toEqual({ key: 'needs-permission', folder: 'S', lastWrite: null });
    expect(lineFor({ kind: 'failed', folder: 'S', lastWrite: 7, reason: 'voll' }))
      .toEqual({ key: 'failed', reason: 'voll', lastWrite: 7 });
    expect(lineFor({ kind: 'held', folder: 'S', lastWrite: 7 }))
      .toEqual({ key: 'held', folder: 'S', lastWrite: 7 });
  });

  /* failed reports the reason and not the folder: the sentence is about what
     went wrong, and all three products wrote it that way. */
  it('gives failed its reason rather than its folder', () => {
    const line = lineFor({ kind: 'failed', folder: 'Sicherung', lastWrite: null, reason: 'voll' });
    expect(line).not.toHaveProperty('folder');
    expect(line).toMatchObject({ reason: 'voll' });
  });

  it('answers for every state a panel is ever drawn in', () => {
    const every: Status[] = [
      { kind: 'unsupported' },
      { kind: 'off' },
      { kind: 'saving', folder: 'S', lastWrite: null },
      { kind: 'idle', folder: 'S', lastWrite: null },
      { kind: 'needs-permission', folder: 'S', lastWrite: null },
      { kind: 'failed', folder: 'S', lastWrite: null, reason: 'r' },
      { kind: 'held', folder: 'S', lastWrite: null },
    ];
    for (const status of every) expect(lineFor(status).key).toBeTruthy();
  });
});

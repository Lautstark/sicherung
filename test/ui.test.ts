import { describe, expect, it, vi } from 'vitest';
import { actionsFor, ago, type Actor } from '../src/ui.js';
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
  return { calls, choose: stub('choose'), confirm: stub('confirm'), save: stub('save'), forget: stub('forget') };
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

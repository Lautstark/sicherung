import { describe, expect, it } from 'vitest';
import { actionsFor, lineFor, needsAttention, type Keeper } from '../src/ablage-ui.js';
import type { AblageStatus } from '../src/types.js';

const nothing = async () => ({ kind: 'off' }) as AblageStatus;
const store: Keeper = { choose: nothing, confirm: nothing, forget: nothing };
const ids = (status: AblageStatus) => actionsFor(store, status).map((a) => a.id);
const primary = (status: AblageStatus) => actionsFor(store, status).find((a) => a.primary)?.id;

describe('what needs somebody', () => {
  it('is the four states that will not right themselves', () => {
    const yes: AblageStatus[] = [
      { kind: 'needs-permission', folder: 'F' },
      { kind: 'failed', folder: 'F', reason: 'x' },
      { kind: 'stale', folder: 'F', reason: 'x' },
      { kind: 'conflicted', folder: 'F', ids: ['a'] },
    ];
    const no: AblageStatus[] = [
      { kind: 'unsupported' }, { kind: 'off' },
      { kind: 'idle', folder: 'F' }, { kind: 'saving', folder: 'F' },
    ];
    expect(yes.every(needsAttention)).toBe(true);
    expect(no.some(needsAttention)).toBe(false);
  });
});

describe('what can be done', () => {
  it('offers nothing where there is no picker', () => {
    expect(ids({ kind: 'unsupported' })).toEqual([]);
  });

  it('leads with putting a withdrawn permission back, because nothing was lost', () => {
    expect(primary({ kind: 'needs-permission', folder: 'F' })).toBe('confirm');
  });

  it('answers a folder that went away by pointing at it again', () => {
    expect(primary({ kind: 'stale', folder: 'F', reason: 'gone' })).toBe('retry');
    expect(ids({ kind: 'stale', folder: 'F', reason: 'gone' })).toContain('choose');
  });

  it('does not try to resolve a conflict from a panel', () => {
    expect(ids({ kind: 'conflicted', folder: 'F', ids: ['a', 'b'] })).toEqual(['choose', 'forget']);
  });
});

describe('what a panel says', () => {
  it('counts the conflicts rather than naming them', () => {
    expect(lineFor({ kind: 'conflicted', folder: 'F', ids: ['a', 'b'] }))
      .toEqual({ key: 'conflicted', folder: 'F', count: 2 });
  });

  it('carries the reason a folder is out of reach', () => {
    expect(lineFor({ kind: 'stale', folder: 'F', reason: 'disk gone' }))
      .toEqual({ key: 'stale', folder: 'F', reason: 'disk gone' });
  });

  it('has a line for every state, so none can arrive blank', () => {
    const every: AblageStatus[] = [
      { kind: 'unsupported' }, { kind: 'off' }, { kind: 'saving', folder: 'F' },
      { kind: 'idle', folder: 'F' }, { kind: 'needs-permission', folder: 'F' },
      { kind: 'failed', folder: 'F', reason: 'x' }, { kind: 'stale', folder: 'F', reason: 'x' },
      { kind: 'conflicted', folder: 'F', ids: [] },
    ];
    for (const status of every) expect(lineFor(status).key).toBeTruthy();
  });
});

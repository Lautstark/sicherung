// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { backupPanel, headlineFor, sentenceFor } from '../src/backup-panel.js';
import type { Sicherung } from '../src/index.js';
import type { Status } from '../src/types.js';

/*
 * The panel four products drew for themselves.
 *
 * What is asserted here is what the four copies disagreed about, rather than
 * that the module runs: the age rule, the headline's one distinction, the
 * subscription being handed back, and both languages having every word. A test
 * that only mounted the node would have passed against all four copies,
 * including the three with a leak in them.
 */

/** Just enough of a Sicherung to paint against, with a status we control. */
function stub(status: Status) {
  const listeners: ((next: Status) => void)[] = [];
  const backup = {
    status,
    subscribe: vi.fn((listener: (next: Status) => void) => {
      listeners.push(listener);
      return () => { listeners.splice(listeners.indexOf(listener), 1); };
    }),
    choose: async () => status, confirm: async () => status,
    confirmEmpty: async () => status, save: async () => status, forget: async () => status,
  };
  return { backup: backup as unknown as Sicherung, listeners };
}

const DAY = 24 * 60 * 60 * 1000;
const elevenDaysAgo = Date.now() - 11 * DAY;

describe('the age, in every state that is writing nothing', () => {
  /* „es funktioniert nicht" is a sentence somebody can put off; „seit elf Tagen
     nichts gesichert" is not. This is the rule the module exists to hold. */
  it.each([
    ['needs-permission', { kind: 'needs-permission', folder: 'S', lastWrite: elevenDaysAgo }],
    ['failed', { kind: 'failed', reason: 'voll', lastWrite: elevenDaysAgo }],
    ['held', { kind: 'held', folder: 'S', lastWrite: elevenDaysAgo }],
  ] as const)('%s carries how old the last copy is', (_name, status) => {
    /* Asserted on the wrapper rather than on a unit: how `ago` rounds is its
       own business — eleven days comes back as „vor 2 Wochen" — and pinning a
       unit here would make this a test of the arithmetic next door. */
    expect(sentenceFor(status as Status, 'de')).toContain('zuletzt gesichert');
  });

  it.each([
    ['needs-permission', { kind: 'needs-permission', folder: 'S', lastWrite: null }],
    ['failed', { kind: 'failed', reason: 'voll', lastWrite: null }],
  ] as const)('%s admits when there has never been one', (_name, status) => {
    expect(sentenceFor(status as Status, 'de')).toContain('noch nie gesichert');
    expect(sentenceFor(status as Status, 'en')).toContain('never saved');
  });
});

describe('the headline', () => {
  const folder = 'Sicherungen';

  it('says nothing where there is no folder', () => {
    expect(headlineFor({ kind: 'off' } as Status)).toBe('');
    expect(headlineFor({ kind: 'unsupported' } as Status)).toBe('');
  });

  /* The distinction the whole module is built on: a folder being written and
     one that only looks like it is must not read the same in a heading. */
  it('keeps a written folder apart from one that only looks written', () => {
    const written = headlineFor({ kind: 'idle', folder, lastWrite: 1 } as Status);
    for (const stalled of [
      { kind: 'needs-permission', folder, lastWrite: 1 },
      { kind: 'failed', folder, reason: 'voll', lastWrite: 1 },
      { kind: 'held', folder, lastWrite: 1 },
    ] as const) {
      expect(headlineFor(stalled as unknown as Status)).not.toBe(written);
    }
  });
});

describe('both languages say everything', () => {
  /* mitreden's English carried German quotation marks for as long as it
     existed, because nothing compared the two arms. */
  const states: Status[] = ([
    { kind: 'off' }, { kind: 'saving', folder: 'S', lastWrite: null },
    { kind: 'idle', folder: 'S', lastWrite: null },
    { kind: 'idle', folder: 'S', lastWrite: elevenDaysAgo },
    { kind: 'needs-permission', folder: 'S', lastWrite: null },
    { kind: 'failed', folder: 'S', reason: 'voll', lastWrite: null },
    { kind: 'held', folder: 'S', lastWrite: null },
  ] as unknown[]) as Status[];

  it.each(['de', 'en'] as const)('%s answers every state with a sentence', (lang) => {
    for (const status of states) expect(sentenceFor(status, lang).length).toBeGreaterThan(0);
  });

  /* Only „ (U+201E) is decisive. German closes with “ (U+201C), which is the
     character English *opens* with — so a regex banning both would fail the
     correct English and pass a German sentence that had lost its opener. */
  it('does not put a German opening quote in the English', () => {
    for (const status of states) {
      expect(sentenceFor(status, 'en')).not.toContain('\u201E');
      expect(headlineFor(status, 'en')).not.toContain('\u201E');
    }
  });
});

describe('mounting', () => {
  it('draws nothing at all where the browser has no picker', () => {
    const { backup } = stub({ kind: 'unsupported' } as Status);
    expect(backupPanel({ backup, say: () => {} })).toBeNull();
  });

  /* Three of the four products subscribed on mount and never unsubscribed, so
     every reopen of a settings dialog left a listener painting a detached node. */
  it('hands back the unsubscribe, and it actually unsubscribes', () => {
    const { backup, listeners } = stub({ kind: 'off' } as Status);
    const panel = backupPanel({ backup, say: () => {} })!;
    expect(listeners).toHaveLength(1);
    panel.dispose();
    expect(listeners).toHaveLength(0);
  });

  it('tells the heading on the first paint, not only on the next change', () => {
    const { backup } = stub({ kind: 'idle', folder: 'Sicherungen', lastWrite: 1 } as Status);
    const headline = vi.fn();
    backupPanel({ backup, say: () => {}, headline });
    expect(headline).toHaveBeenCalledWith('Ordner „Sicherungen“');
  });

  it('takes the status kind into data-state verbatim', () => {
    const { backup } = stub({ kind: 'failed', folder: 'S', reason: 'voll', lastWrite: null } as Status);
    const panel = backupPanel({ backup, say: () => {} })!;
    expect(panel.node.querySelector('.standing')!.getAttribute('data-state')).toBe('failed');
  });
});

describe('the language is read on every paint, not captured', () => {
  /* mitreden changes language without reloading. A locale taken once goes on
     answering in the language the reader has just left, and stays perfectly
     well-formed while it does — which is why this is asserted rather than
     assumed. The rule arrives here from mitreden's own
     tests/unit/backup-language.test.ts, which is what caught this module
     taking `lang` once. */
  it('follows a language that changes under it', () => {
    const { backup } = stub({ kind: 'off' } as Status);
    let lang: 'de' | 'en' = 'de';
    const panel = backupPanel({ backup, say: () => {}, lang: () => lang })!;
    expect(panel.node.textContent).toContain('Noch kein Ordner');

    lang = 'en';
    panel.refresh();
    expect(panel.node.textContent).toContain('No folder');
    expect(panel.node.textContent).not.toContain('Noch kein Ordner');
  });

  it('still takes a plain value', () => {
    const { backup } = stub({ kind: 'off' } as Status);
    const panel = backupPanel({ backup, say: () => {}, lang: 'en' })!;
    expect(panel.node.textContent).toContain('No folder');
  });
});

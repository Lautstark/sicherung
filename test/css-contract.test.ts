// @vitest-environment jsdom
/*
 * The CSS contract, conventions.md §4.12: a shared module that emits markup
 * brings its CSS. Until 2026-09-16 that was prose; this is the check.
 *
 * Every class name a module puts on a node has to be one
 * @lautstark/design/components.css draws - a selector in that file names it.
 * Each panel is rendered in every state it has, the class tokens of every node
 * under it are collected, and the difference against the stylesheet has to be
 * empty. A name that is missing is either a rule that belongs in
 * components.css and is not there yet, or a class the module should not be
 * emitting at all - §4.12 says which, and neither is this test's to decide.
 *
 * components.css comes in as a devDependency for exactly this: the package
 * does not import it at runtime, the products do, and what is asserted here
 * is that what they import draws what this package emits.
 *
 * ## The two halves come from design now
 *
 * `drawnClasses()` and `emittedClasses()` were three character-identical
 * copies - here, in bildquelle and in stimmquelle - and all three said in
 * their header that they belonged in design beside the file they read, the day
 * a release could carry them there. design 1.33.1 is that release, and
 * `@lautstark/design/css` is where they live.
 *
 * Taking them from there rather than keeping the local pair is not tidiness.
 * A Svelte component with a `<style>` block puts its scoping hash into
 * `classList` beside the real names - measured: `["panel", "svelte-1fnslke",
 * "section", "state", "body"]` - and design's `emittedClasses` skips
 * `/^svelte-[0-9a-z]+$/`. A local walk would fail every styled component in
 * `svelte/` and report a hash as the missing class, which is a message nobody
 * can act on. None of the components here styles itself today; the day one
 * does, this file is already right.
 *
 * ## The exceptions are gone, which is the guard having worked
 *
 * This file carried a `KNOWN_MISSING` map — `small`, `muted` and `faint`, the
 * three typographic utilities both panels put on their text and no stylesheet
 * in the family drew — and a test beside it asserting those three were *still*
 * undrawn, so that the entry would go the day the rule landed rather than
 * outliving it. components.css draws all three as of design 1.32, the bump to
 * 1.33.1 made that test fail, and the map and the test went with it.
 *
 * A later exception comes back the same way: an entry with a date and a reason,
 * and the guard that fails the day it stops being one. Nothing is tolerated
 * here without both.
 *
 * ## The Svelte twins are held to the same contract
 *
 * `svelte/BackupPanel.svelte` and `svelte/AblagePanel.svelte` emit what the
 * vanilla panels emit, and `svelte/Rescue.svelte` is new markup in this
 * package - conventions.md §6.7 and §6.8. All three are mounted here in every
 * state they draw, because "same emitted markup" is a claim and this is the
 * only thing in the family that checks it.
 *
 * ## Everything comes in through `../dist`, as a consumer's does
 *
 * Since 2026-09-17 the components import the package's published entries
 * rather than its `src/` — `test/published-entries.test.ts` has the whole of
 * why. This file follows for a reason of its own: the vanilla `wherePanel` and
 * the Svelte `AblagePanel` are compared against each other here, and a vanilla
 * panel built from `src` beside a component reading `dist` is two copies of
 * `announceFolder`'s module. They happen to agree today — what it reads is a
 * cookie — and a contract test that holds two builds of the same module
 * against each other is answering about an arrangement no consumer has.
 */
import { drawnClasses, emittedClasses } from '@lautstark/design/css';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeTree } from './folder.js';
import { backupPanel } from '../dist/backup-panel.js';
import type { Sicherung, Status } from '../dist/index.js';
import type { AblageStatus } from '../dist/ablage.js';
import AblagePanel from '../svelte/AblagePanel.svelte';
import BackupPanel from '../svelte/BackupPanel.svelte';
import Rescue from '../svelte/Rescue.svelte';
import { Rescuing, type RescueWords } from '../svelte/rescuing.svelte.js';

const folders = new Map<string, unknown>();
vi.mock('../dist/store.js', () => ({
  readFolder: async (key: string) => folders.get(key) ?? null,
  writeFolder: async (key: string, folder: unknown) => { folders.set(key, folder); },
  forgetFolder: async (key: string) => { folders.delete(key); },
}));
const { Ablage } = await import('../dist/ablage.js');
const { wherePanel } = await import('../dist/ablage-panel.js');

const DAY = 24 * 60 * 60 * 1000;
const STATUSES: Status[] = [
  { kind: 'unsupported' },
  { kind: 'off' },
  { kind: 'idle', folder: 'Sicherungen', lastWrite: Date.now() - 11 * DAY },
  { kind: 'saving', folder: 'Sicherungen', lastWrite: null },
  { kind: 'needs-permission', folder: 'Sicherungen', lastWrite: null },
  { kind: 'held', folder: 'Sicherungen', lastWrite: Date.now() - DAY },
  { kind: 'failed', folder: 'Sicherungen', reason: 'voll', lastWrite: null },
] as Status[];

/** Every state an `Ablage` can be in, which is two more than a `Sicherung`. */
const ABLAGE_STATUSES: AblageStatus[] = [
  { kind: 'unsupported' },
  { kind: 'off' },
  { kind: 'idle', folder: 'Haushalt' },
  { kind: 'saving', folder: 'Haushalt' },
  { kind: 'needs-permission', folder: 'Haushalt' },
  { kind: 'failed', folder: 'Haushalt', reason: 'voll' },
  { kind: 'stale', folder: 'Haushalt', reason: 'nicht erreichbar' },
  { kind: 'conflicted', folder: 'Haushalt', ids: ['a', 'b'] },
];

function stubBackup(status: Status): Sicherung {
  return {
    status,
    subscribe: () => () => {},
    choose: async () => status, confirm: async () => status,
    confirmEmpty: async () => status, save: async () => status, forget: async () => status,
  } as unknown as Sicherung;
}

/**
 * An `Ablage` that answers a state without a folder behind it.
 *
 * The real one is exercised beside it - the vanilla case below still builds a
 * `FakeTree` - but four of the eight states cannot be reached by picking a
 * folder in jsdom, and the contract is about the markup rather than about how
 * the state was arrived at.
 */
function stubStore(first: AblageStatus, extra: Record<string, unknown> = {}) {
  let status = first;
  let tell: ((next: AblageStatus) => void) | null = null;
  return {
    app: 'wochenwerk',
    get status() { return status; },
    subscribe(listener: (next: AblageStatus) => void) {
      tell = listener;
      listener(status);
      return () => { tell = null; };
    },
    move(next: AblageStatus) { status = next; tell?.(next); },
    choose: async () => status,
    confirm: async () => status,
    forget: async () => status,
    nest: async () => status,
    folders: async () => [],
    adopted: async () => true,
    ...extra,
  };
}

const WORDS: RescueWords = {
  body: (from) => `Die Datenbank ist bei Version ${from} stehen geblieben.`,
  holds: (count) => `${count} Einträge`,
  saved: 'Gespeichert.',
  discarding: 'Wird gelöscht …',
  failed: (reason) => `Fehlgeschlagen: ${reason}`,
  download: 'Als Datei sichern',
  discard: (from) => `Version ${from} verwerfen`,
};

/* Every mount is torn down, which is not hygiene here: the components hold
   their status through an `$effect` returning the unsubscribe, and a test that
   never unmounts never runs the line §6.8 is about. */
const live: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const app of live.splice(0)) void unmount(app);
  document.body.replaceChildren();
});

function render(component: unknown, props: Record<string, unknown>): HTMLElement {
  const target = document.createElement('div');
  document.body.append(target);
  live.push(mount(component as Parameters<typeof mount>[0], { target, props }));
  flushSync();
  return target;
}

const settled = () => new Promise((done) => setTimeout(done, 0));

describe('every class name the panels emit is drawn by components.css', () => {
  const drawn = drawnClasses();
  const missingFrom = (node: Element) =>
    [...emittedClasses(node)].filter((name) => !drawn.has(name));

  it('components.css was found and has rules', () => {
    expect(drawn.size).toBeGreaterThan(20);
  });

  it.each(STATUSES.map((s) => [s.kind, s] as const))('backup-panel, %s', (_kind, status) => {
    const panel = backupPanel({ backup: stubBackup(status), say: () => {} });
    // null is the panel's answer where the browser cannot do this at all;
    // there is nothing drawn and nothing to hold to the contract.
    if (!panel) return;
    expect(missingFrom(panel.node)).toEqual([]);
    panel.dispose();
  });

  it.each([['no folder', null], ['a folder', new FakeTree()]] as const)('ablage-panel, %s', async (_name, tree) => {
    folders.clear();
    (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker =
      async () => { if (!tree) throw new Error('AbortError'); return tree; };
    const store = new Ablage({ app: 'wochenwerk', kinds: ['termine'] as const });
    if (tree) await store.choose?.();
    const panel = wherePanel({
      store, adopt: async () => 'pushed', changed: () => {}, say: () => {},
    });
    expect(missingFrom(panel.node)).toEqual([]);
  });

  it.each(STATUSES.map((s) => [s.kind, s] as const))('svelte/BackupPanel, %s', (kind, status) => {
    const node = render(BackupPanel, { backup: stubBackup(status), say: () => {} });
    // The same answer the vanilla function gives by returning null: a browser
    // with no picker is shown no backup story at all.
    if (kind === 'unsupported') expect(node.children.length).toBe(0);
    expect(missingFrom(node)).toEqual([]);
  });

  it.each(ABLAGE_STATUSES.map((s) => [s.kind, s] as const))('svelte/AblagePanel, %s', (_kind, status) => {
    const node = render(AblagePanel, {
      store: stubStore(status), adopt: async () => 'pushed', changed: () => {}, say: () => {},
    });
    expect(missingFrom(node)).toEqual([]);
  });

  it('svelte/AblagePanel, with the consent switch', () => {
    const node = render(AblagePanel, {
      store: stubStore({ kind: 'idle', folder: 'Haushalt' }),
      adopt: async () => 'pushed',
      changed: () => {},
      say: () => {},
      share: { reads: () => false, write: async () => {} },
    });
    expect(node.querySelector('.check')).not.toBe(null);
    expect(missingFrom(node)).toEqual([]);
  });

  it('svelte/AblagePanel, asking about a folder that holds nothing of ours', async () => {
    const store = stubStore({ kind: 'off' }, { adopted: async () => false });
    store.choose = async () => {
      store.move({ kind: 'idle', folder: 'Haushalt' });
      return store.status;
    };
    const node = render(AblagePanel, {
      store, adopt: async () => 'pushed', changed: () => {}, say: () => {},
    });
    node.querySelector('button')!.click();
    await settled();
    flushSync();
    // The question, with the folder it is about drawn as a tree.
    expect(node.querySelector('.tree')?.textContent).toContain('Haushalt');
    expect(missingFrom(node)).toEqual([]);
  });

  it.each([['before the file is taken', false], ['after it', true]] as const)(
    'svelte/Rescue, %s', (_name, saved) => {
      const rescue = new Rescuing(4, 312, WORDS, {
        save: () => {}, discard: () => {}, again: () => {},
      });
      rescue.saved = saved;
      const node = render(Rescue, { s: rescue });
      expect(missingFrom(node)).toEqual([]);
    });
});

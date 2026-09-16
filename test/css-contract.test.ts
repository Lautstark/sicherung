/* The CSS contract, conventions.md §4.12: a shared module that emits markup
 * brings its CSS. Until 2026-09-16 that was prose; this is the check.
 *
 * Every class name the module puts on a node has to be one
 * @lautstark/design/components.css draws - a selector in that file names it.
 * The panel is rendered in every state it has, the class tokens of every node
 * under it are collected, and the difference against the stylesheet has to be
 * empty. A name that is missing is either a rule that belongs in
 * components.css and is not there yet, or a class the module should not be
 * emitting at all - §4.12 says which, and neither is this test's to decide.
 *
 * components.css comes in as a devDependency for exactly this: the package
 * does not import it at runtime, the products do, and what is asserted here
 * is that what they import draws what this package emits.
 *
 * drawnClasses() is three copies today - sicherung, bildquelle, stimmquelle -
 * and belongs in @lautstark/design beside the file it reads, the day a
 * release of design can carry it there. Written 2026-09-16.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Every class name that has a rule in components.css. */
function drawnClasses(): Set<string> {
  const path = createRequire(import.meta.url).resolve('@lautstark/design/components.css');
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const drawn = new Set<string>();
  // The text before each `{` is a selector list (or an at-rule prelude, which
  // holds no class). Declarations never reach this: they sit after the brace.
  for (const [, prelude] of css.matchAll(/([^{};]+)\{/g)) {
    for (const [, name] of prelude.matchAll(/\.([A-Za-z_][\w-]*)/g)) drawn.add(name);
  }
  return drawn;
}

/** Every class token on a node and everything under it. */
function emittedClasses(root: Element): Set<string> {
  const names = new Set<string>();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const name of el.classList) names.add(name);
  }
  return names;
}

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { FakeTree } from './folder.js';
import { backupPanel } from '../src/backup-panel.js';
import type { Sicherung } from '../src/index.js';
import type { Status } from '../src/types.js';

const folders = new Map<string, unknown>();
vi.mock('../src/store.js', () => ({
  readFolder: async (key: string) => folders.get(key) ?? null,
  writeFolder: async (key: string, folder: unknown) => { folders.set(key, folder); },
  forgetFolder: async (key: string) => { folders.delete(key); },
}));
const { Ablage } = await import('../src/ablage.js');
const { wherePanel } = await import('../src/ablage-panel.js');

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

function stubBackup(status: Status): Sicherung {
  return {
    status,
    subscribe: () => () => {},
    choose: async () => status, confirm: async () => status,
    confirmEmpty: async () => status, save: async () => status, forget: async () => status,
  } as unknown as Sicherung;
}

/* What this test found on the day it was written, and tolerates until the
 * shared layer catches up.
 *
 * Both panels put `small`, `muted` and `faint` on their text - the three
 * typographic utilities every product had written for itself (bildhaft and
 * wochenwerk in their own stylesheets, identical values; mitreden and
 * vorlaut-editor not at all, so there the hint under the panel renders at
 * body size in body colour). That is the drift §4.12 describes, one level
 * down from the panel itself. The rules belong in components.css and are
 * being added there; this list goes when the design devDependency moves to
 * the release that carries them. Nothing may be added to it without a date
 * and a reason. */
const KNOWN_MISSING = new Map<string, string>([
  ['small', '2026-09-16: typographic utility, moving into components.css'],
  ['muted', '2026-09-16: typographic utility, moving into components.css'],
  ['faint', '2026-09-16: typographic utility, moving into components.css'],
]);

describe('every class name the panels emit is drawn by components.css', () => {
  const drawn = drawnClasses();
  const missingFrom = (node: Element) =>
    [...emittedClasses(node)].filter((name) => !drawn.has(name) && !KNOWN_MISSING.has(name));

  it('the exceptions are still exceptions', () => {
    // The day components.css draws one of these, this fails and the entry goes.
    for (const name of KNOWN_MISSING.keys()) expect(drawn.has(name), name).toBe(false);
  });

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
});

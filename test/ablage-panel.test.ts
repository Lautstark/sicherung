// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTree } from './folder.js';

/*
 * One panel for every product, so what it says is asserted once rather than
 * three times in three wordings. These tests are about the sentences and the
 * controls each state offers — the states themselves are `ablage-ui`'s.
 */
const folders = new Map<string, unknown>();
vi.mock('../src/store.js', () => ({
  readFolder: async (key: string) => folders.get(key) ?? null,
  writeFolder: async (key: string, folder: unknown) => { folders.set(key, folder); },
  forgetFolder: async (key: string) => { folders.delete(key); },
}));

const { Ablage } = await import('../src/ablage.js');
const { wherePanel } = await import('../src/ablage-panel.js');

const KINDS = ['termine'] as const;
const make = (tree: FakeTree | null) => {
  (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker =
    async () => { if (!tree) throw new Error('AbortError'); return tree; };
  return new Ablage({ app: 'wochenwerk', kinds: KINDS });
};
const panelFor = (store: InstanceType<typeof Ablage>, extra = {}) =>
  wherePanel({
    store, adopt: async () => 'pushed', changed: () => {}, say: () => {}, ...extra,
  });

const words = (node: HTMLElement) => node.textContent ?? '';
const buttons = (node: HTMLElement) =>
  [...node.querySelectorAll('button')].map((b) => b.textContent ?? '');

beforeEach(() => { folders.clear(); document.body.replaceChildren(); });

describe('the panel with no folder', () => {
  it('states the browser as a whole answer, with nothing red about it', () => {
    const { node } = panelFor(make(new FakeTree()));
    expect(words(node)).toContain('In diesem Browser');
    expect(node.querySelector('.where.bad')).toBeNull();
    expect(buttons(node)).toEqual(['Ordner wählen …']);
  });

  it('draws the folder before the decision, so one picture does the explaining', () => {
    const { node } = panelFor(make(new FakeTree()));
    expect(node.querySelector('.tree')?.textContent).toContain('Lautstark');
  });

  it('offers rather than urges', () => {
    const { node } = panelFor(make(new FakeTree()));
    expect(words(node)).toContain('Das reicht für einen Haushalt mit einem Gerät');
    expect(node.querySelector('button.primary')).toBeNull();
  });
});

describe('the panel with a folder', () => {
  const connected = async (extra = {}) => {
    const store = make(new FakeTree());
    await store.choose();
    const panel = panelFor(store, extra);
    panel.refresh();
    return { store, panel };
  };

  it('says what is, and steps its actions back', async () => {
    const { panel } = await connected();
    expect(words(panel.node)).toContain('Im Ordner „Haushalt“');
    expect(buttons(panel.node)).toEqual(['Anderer Ordner', 'Ordner vergessen']);
  });

  it('draws no switch where the product does not offer one', async () => {
    const { panel } = await connected();
    expect(panel.node.querySelector('.check')).toBeNull();
  });

  it('draws the switch off, and says what it stores before it is touched', async () => {
    let on = false;
    const { panel } = await connected({
      share: { reads: () => on, write: async (next: boolean) => { on = next; } },
    });
    const box = panel.node.querySelector<HTMLInputElement>('.check input')!;
    expect(box.checked).toBe(false);
    expect(words(panel.node)).toContain('bei jedem Aufruf mitgeht');
  });

  it('speaks English where a product does', async () => {
    const { panel } = await connected({ lang: 'en' });
    expect(words(panel.node)).toContain('In the folder “Haushalt”');
    expect(buttons(panel.node)).toEqual(['A different folder', 'Forget the folder']);
  });
});

describe('the panel where the folder went out of reach', () => {
  it('warns, and makes trying again the one action it would pick', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    (tree.dirs.get('wochenwerk')?.dirs.get('termine') as FakeTree | undefined);
    await store.write('termine', { id: '11111111-1111-4111-8111-111111111111', updatedAt: 1 });
    (tree.dirs.get('wochenwerk')!.dirs.get('termine') as FakeTree).failWrites = 'gone';
    await store.write('termine', { id: '11111111-1111-4111-8111-111111111111', updatedAt: 2 });
    const panel = panelFor(store);
    panel.refresh();
    expect(panel.node.querySelector('.where.bad')).not.toBeNull();
    expect(buttons(panel.node)[0]).toBe('Nochmal versuchen');
    expect(panel.node.querySelector('button.primary')?.textContent).toBe('Nochmal versuchen');
  });
});

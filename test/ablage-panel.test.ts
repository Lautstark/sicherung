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
    const tree = node.querySelector('.tree')?.textContent ?? '';
    expect(tree).toContain('Lautstark');
    /* This programme's own compartment first: a picture of somebody else's two
       folders explains the idea and not their situation. */
    expect(tree.split('\n')[1]).toContain('wochenwerk/');
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

/*
 * A press that takes a second is a press that can be made twice.
 *
 * A household connected a folder on 2026-09-14, pressed „Ordner ‚Lautstark‘
 * anlegen“, saw nothing move, and pressed it again. The first press had already
 * nested and was somewhere in the middle of writing the store; the second
 * nested again, into the folder the first had just made. What was left was a
 * marked store at `Lautstark/Lautstark/wochenwerk` and an abandoned, unmarked
 * half of one at `Lautstark/wochenwerk` — and an unmarked folder is precisely
 * what the next device reads as unclaimed and adopts over.
 *
 * Nothing was slow or broken. The buttons were simply still there and still
 * pressable, because the panel does not redraw until the work it started is
 * finished.
 */
describe('a button that has been pressed', () => {
  const settled = () => new Promise((done) => setTimeout(done, 0));
  const press = (node: HTMLElement, label: string) => {
    const found = [...node.querySelectorAll('button')].find((b) => b.textContent === label);
    if (!found) throw new Error(`no button says "${label}": ${buttons(node).join(', ')}`);
    found.click();
    return found;
  };

  /* A folder holding nothing of ours: the one case where the panel asks. */
  const asked = async (extra = {}) => {
    const tree = new FakeTree('Dropbox');
    const store = make(tree);
    const panel = panelFor(store, extra);
    press(panel.node, 'Ordner wählen …');
    await settled();
    return { tree, store, panel };
  };

  it('asks where the folder should go, before anything is made', async () => {
    const { panel } = await asked();
    expect(words(panel.node)).toContain('In „Dropbox“ liegt noch nichts von Lautstark');
    expect(buttons(panel.node)).toEqual(['Ordner „Lautstark“ anlegen', '„Dropbox“ direkt benutzen']);
  });

  it('shuts at the press, rather than when the work it started is done', async () => {
    const { panel } = await asked();
    const made = press(panel.node, 'Ordner „Lautstark“ anlegen');
    /* Now, in the same tick as the click, and not one await later. */
    expect(made.disabled).toBe(true);
    expect([...panel.node.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    await settled();
  });

  it('nests once when it is pressed twice', async () => {
    const { tree, store, panel } = await asked();
    const nest = vi.spyOn(store, 'nest');
    const made = press(panel.node, 'Ordner „Lautstark“ anlegen');
    made.click();
    made.click();
    await settled();
    expect(nest).toHaveBeenCalledTimes(1);
    /* The shape the household was left with, and the reason this matters: the
       shallow one is unmarked, and unmarked reads as unclaimed. */
    expect([...(tree.dirs.get('Lautstark') as FakeTree).dirs.keys()]).not.toContain('Lautstark');
    expect(store.handle()).toBe(tree.dirs.get('Lautstark'));
  });

  it('adopts once when it is pressed twice', async () => {
    let adoptions = 0;
    const { panel } = await asked({ adopt: async () => { adoptions++; return 'pushed'; } });
    const made = press(panel.node, 'Ordner „Lautstark“ anlegen');
    made.click();
    await settled();
    expect(adoptions).toBe(1);
  });

  it('is pressable again once the work is done', async () => {
    const { panel } = await asked();
    press(panel.node, 'Ordner „Lautstark“ anlegen');
    await settled();
    expect([...panel.node.querySelectorAll('button')].some((b) => b.disabled)).toBe(false);
    expect(buttons(panel.node)).toEqual(['Anderer Ordner', 'Ordner vergessen']);
  });

  /* The product's own `changed()` redraws half the screen, and this panel is
     often on it. A redraw must not hand back a fresh, enabled button while the
     press that caused it is still running. */
  it('stays shut through a redraw somebody else asked for', async () => {
    const { panel } = await asked();
    press(panel.node, 'Ordner „Lautstark“ anlegen');
    panel.refresh();
    expect([...panel.node.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    await settled();
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

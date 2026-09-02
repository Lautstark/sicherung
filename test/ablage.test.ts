import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTree } from './folder.js';

/* The store is mocked for the same reason `sicherung.test.ts` mocks it: a handle
   loses its prototype through `structuredClone`, so a fake that went through
   IndexedDB would come back without the methods under test. */
const folders = new Map<string, unknown>();
vi.mock('../src/store.js', () => ({
  readFolder: async (key: string) => folders.get(key) ?? null,
  writeFolder: async (key: string, folder: unknown) => { folders.set(key, folder); },
  forgetFolder: async (key: string) => { folders.delete(key); },
}));

const { Ablage, announceFolder, announcedFolder, stopAnnouncing } = await import('../src/ablage.js');

const KINDS = ['termine', 'karten'] as const;
const make = (tree: FakeTree | null) => {
  (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker =
    async () => { if (!tree) throw new Error('AbortError'); return tree; };
  return new Ablage({ app: 'wochenwerk', kinds: KINDS });
};
const record = (id: string, updatedAt = 1, extra: Record<string, unknown> = {}) =>
  ({ id, updatedAt, ...extra });

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => { folders.clear(); });

describe('opening', () => {
  it('is off before a folder is chosen, and idle after', async () => {
    const store = make(new FakeTree());
    expect(store.status).toEqual({ kind: 'off' });
    expect(await store.choose()).toEqual({ kind: 'idle', folder: 'Haushalt' });
  });

  it('costs nothing when the picker is dismissed', async () => {
    const store = make(null);
    expect(await store.choose()).toEqual({ kind: 'off' });
  });

  it('re-attaches on a later visit without prompting', async () => {
    const tree = new FakeTree();
    await make(tree).choose();
    expect(await make(tree).restore()).toEqual({ kind: 'idle', folder: 'Haushalt' });
  });

  it('asks again when the browser has withdrawn permission', async () => {
    const tree = new FakeTree();
    await make(tree).choose();
    tree.decay();
    const next = make(tree);
    expect(await next.restore()).toEqual({ kind: 'needs-permission', folder: 'Haushalt' });
    expect(await next.confirm()).toEqual({ kind: 'idle', folder: 'Haushalt' });
  });

  it('keeps its folder apart from the backup"s', async () => {
    const tree = new FakeTree();
    await make(tree).choose();
    expect([...folders.keys()]).toEqual(['ablage:wochenwerk']);
  });
});

describe('records', () => {
  it('writes one file per record, under the app and the kind', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    expect([...tree.at('wochenwerk/termine')!.files.keys()]).toEqual([`${A}.json`]);
  });

  it('reads back what it wrote, and nothing it did not', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A, 7, { title: 'Kita' }));
    expect(await store.read('termine', A)).toMatchObject({ id: A, updatedAt: 7, title: 'Kita' });
    expect(await store.read('termine', B)).toBeNull();
  });

  it('lists ids and stamps only', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A, 3, { secret: 'x' }));
    expect(await store.list('termine')).toEqual([{ id: A, updatedAt: 3 }]);
  });

  it('keeps the kinds apart', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    await store.write('karten', record(B));
    expect((await store.all('termine')).map((r) => r.id)).toEqual([A]);
    expect((await store.all('karten')).map((r) => r.id)).toEqual([B]);
  });

  it('refuses a kind the product did not declare', async () => {
    const store = make(new FakeTree());
    await store.choose();
    await expect(store.write('unbekannt', record(A))).rejects.toThrow(/unknown kind/);
  });

  it('removes one file and leaves its neighbours', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    await store.write('termine', record(B));
    await store.remove('termine', A);
    expect((await store.list('termine')).map((r) => r.id)).toEqual([B]);
  });

  it('reads the files beside one that cannot be parsed', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    tree.at('wochenwerk/termine')!.files.set(`${B}.json`, '{ half written');
    expect((await store.all('termine')).map((r) => r.id)).toEqual([A]);
  });

  it('goes stale when the folder will not take a write, and stops writing', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    // The first write makes the subtree; the disk goes away after that.
    await store.write('termine', record(A));
    tree.at('wochenwerk/termine')!.failWrites = 'disk gone';

    const after = await store.write('termine', record(B));
    expect(after.kind).toBe('stale');
    // Stale means the mirror is being served read-only: nothing else goes out.
    expect((await store.write('termine', record(A, 2))).kind).toBe('stale');
    expect((await store.remove('termine', A)).kind).toBe('stale');
  });
});

describe('noticing a change', () => {
  it('reports what appeared, changed and went', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A, 1));
    await store.poll();

    tree.at('wochenwerk/termine')!.files.set(`${A}.json`, JSON.stringify(record(A, 2)));
    tree.at('wochenwerk/termine')!.files.set(`${B}.json`, JSON.stringify(record(B, 1)));
    expect(await store.poll()).toEqual(
      expect.arrayContaining([
        { kind: 'termine', id: A, what: 'changed' },
        { kind: 'termine', id: B, what: 'appeared' },
      ]),
    );

    tree.at('wochenwerk/termine')!.files.delete(`${A}.json`);
    expect(await store.poll()).toEqual([{ kind: 'termine', id: A, what: 'went' }]);
  });

  it('says nothing when nothing moved', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    await store.poll();
    expect(await store.poll()).toEqual([]);
  });
});

describe('conflicts', () => {
  const decorated = `${A} (in Konflikt stehende Kopie 2026-09-01).json`;

  it('finds the second file a sync client left, with both stamps', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A, 1, { title: 'hier' }));
    tree.conflictOn('wochenwerk/termine', decorated, JSON.stringify(record(A, 9, { title: 'dort' })));

    const [conflict] = await store.conflicts();
    expect(conflict.id).toBe(A);
    expect(conflict.candidates.map((c) => c.updatedAt).sort()).toEqual([1, 9]);
  });

  it('never picks: the stamps are reported, not compared', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A, 1, { title: 'hier' }));
    tree.conflictOn('wochenwerk/termine', decorated, JSON.stringify(record(A, 9, { title: 'dort' })));
    // The older one wins if that is what the person chose.
    await store.resolve('termine', A, `${A}.json`);
    expect(await store.read('termine', A)).toMatchObject({ title: 'hier' });
    expect(await store.conflicts()).toEqual([]);
  });

  it('keeps the one that was chosen and drops the rest', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A, 1, { title: 'hier' }));
    tree.conflictOn('wochenwerk/termine', decorated, JSON.stringify(record(A, 9, { title: 'dort' })));
    await store.resolve('termine', A, decorated);
    expect(await store.read('termine', A)).toMatchObject({ title: 'dort' });
    expect([...tree.at('wochenwerk/termine')!.files.keys()]).toEqual([`${A}.json`]);
  });

  it('leaves an ordinary folder alone', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    await store.write('termine', record(B));
    expect(await store.conflicts()).toEqual([]);
  });
});

describe('forgetting', () => {
  it('puts the folder down and leaves the files', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    expect(await store.forget()).toEqual({ kind: 'off' });
    expect(tree.at('wochenwerk/termine')!.files.size).toBe(1);
    expect(folders.size).toBe(0);
  });
});

/* The two lessons of the first real migration, both written down as the day they
   were learned: a folder that is halfway through becoming a store must never be
   read back, and a batch of writes must say when it stopped. */
describe('becoming the store', () => {
  it('is not a store until it is marked, however much is in it', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    expect(await store.adopted()).toBe(false);
    expect(await store.adopt({ termine: [record(A)], karten: [] })).toEqual({ adopted: true, written: 1 });
    expect(await store.adopted()).toBe(true);
  });

  it('leaves the folder unmarked where not everything landed', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    /* The write of the second record is where the folder goes out of reach. */
    await store.write('termine', record(A));
    (tree.dirs.get('wochenwerk')!.dirs.get('termine') as FakeTree).failWrites = 'the disk went away';
    const went = await store.adopt({ termine: [record(A), record(B)] });
    expect(went.adopted).toBe(false);
    expect(went.reason).toBe('incomplete');
    expect(await store.adopted()).toBe(false);
  });

  it('refuses a folder that is already a store, rather than pushing over it', async () => {
    const tree = new FakeTree();
    const first = make(tree);
    await first.choose();
    await first.adopt({ termine: [record(A)] });
    /* A second machine connecting the same shared folder. */
    const second = make(tree);
    await second.choose();
    expect(await second.adopt({ termine: [record(B)] })).toEqual({ adopted: false, reason: 'already', written: 0 });
    expect((await second.list('termine')).map(item => item.id)).toEqual([A]);
  });
});

describe('a batch of writes', () => {
  it('says how many landed and hands back what did not', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    (tree.dirs.get('wochenwerk')!.dirs.get('termine') as FakeTree).failWrites = 'gone';
    const done = await store.writeAll('termine', [record(A), record(B), record('33333333-3333-4333-8333-333333333333')]);
    expect(done.written).toBe(0);
    expect(done.missed).toHaveLength(3);
  });

  it('stops at the first failure rather than running silently to the end', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    const dir = tree.dirs.get('wochenwerk')!.dirs.get('termine') as FakeTree;
    const before = dir.writes;
    dir.failWrites = 'gone';
    await store.writeAll('termine', Array.from({ length: 50 }, (_, index) =>
      record(`${index}`.padStart(8, '0') + '-0000-4000-8000-000000000000')));
    expect(dir.writes - before).toBe(1);
  });
});

/* Somebody who has not made a folder yet cannot pick one, because a picker only
   offers what exists. They pick where it should live instead. */
describe('making the folder they did not make', () => {
  it('says what is in the chosen folder, so a product can tell a fresh one from a Lautstark one', async () => {
    const tree = new FakeTree('Dropbox');
    const store = make(tree);
    await store.choose();
    expect(await store.folders()).toEqual([]);
    await store.write('termine', record(A));
    expect(await store.folders()).toEqual(['wochenwerk']);
  });

  it('steps into a folder it makes, and keeps that one', async () => {
    const tree = new FakeTree('Dropbox');
    const store = make(tree);
    await store.choose();
    expect(await store.nest('Lautstark')).toEqual({ kind: 'idle', folder: 'Lautstark' });
    await store.write('termine', record(A));
    /* Under Lautstark, not scattered through the Dropbox root. */
    expect([...tree.dirs.keys()]).toEqual(['Lautstark']);
    expect([...(tree.dirs.get('Lautstark') as FakeTree).dirs.keys()]).toEqual(['wochenwerk']);
  });

  it('comes back to the folder it made, not to the one above it', async () => {
    const tree = new FakeTree('Dropbox');
    const first = make(tree);
    await first.choose();
    await first.nest('Lautstark');
    await first.write('termine', record(A));
    const later = make(tree);
    expect(await later.restore()).toEqual({ kind: 'idle', folder: 'Lautstark' });
    expect((await later.list('termine')).map(item => item.id)).toEqual([A]);
  });
});

/* Finding a folder somebody dropped beside their work, so they do not have to
   pick it again on every device. Generosity is the point: strictness here would
   only be convenience for us. */
describe('finding a folder beside the work', () => {
  const withMetacom = (where: FakeTree) => {
    const set = where.dirs.get('METACOM_9_Desktop') ?? new FakeTree('METACOM_9_Desktop');
    where.dirs.set('METACOM_9_Desktop', set);
    set.dirs.set('METACOM_Symbole', new FakeTree('METACOM_Symbole'));
    return set;
  };

  it('finds the folder that holds it, which is the one a picture source wants', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    withMetacom(tree);
    const found = await store.folderHolding('METACOM_Symbole');
    expect(found?.name).toBe('METACOM_9_Desktop');
  });

  it('does not care what the folder above it is called', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    const odd = new FakeTree('symbole von der DVD');
    odd.dirs.set('METACOM_Symbole', new FakeTree('METACOM_Symbole'));
    tree.dirs.set('symbole von der DVD', odd);
    expect((await store.folderHolding('METACOM_Symbole'))?.name).toBe('symbole von der DVD');
  });

  it('reaches a level deeper, for somebody who dropped the whole download in', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    const outer = new FakeTree('Downloads');
    tree.dirs.set('Downloads', outer);
    withMetacom(outer);
    expect((await store.folderHolding('METACOM_Symbole'))?.name).toBe('METACOM_9_Desktop');
  });

  it('takes the chosen folder itself where the inner one was dropped in directly', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    tree.dirs.set('METACOM_Symbole', new FakeTree('METACOM_Symbole'));
    expect((await store.folderHolding('METACOM_Symbole'))?.name).toBe('Haushalt');
  });

  it('reads any spelling, because nobody types a folder name to match ours', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    const set = new FakeTree('metacom');
    set.dirs.set('metacom_symbole', new FakeTree('metacom_symbole'));
    tree.dirs.set('metacom', set);
    expect((await store.folderHolding('METACOM_Symbole'))?.name).toBe('metacom');
  });

  it('says nothing rather than guessing where there is nothing to find', async () => {
    const tree = new FakeTree();
    const store = make(tree);
    await store.choose();
    await store.write('termine', record(A));
    expect(await store.folderHolding('METACOM_Symbole')).toBeNull();
  });
});

/* Only ever switched on by somebody. The tests hold the shape of what travels,
   because that is what was disclosed to the person who agreed to it. */
describe('telling the other programmes which folder', () => {
  /* The tests run without a document, so here is the smallest jar that behaves
     like one: setting replaces the entry by name, reading gives them all back,
     and max-age=0 removes. */
  beforeEach(() => {
    const jar = new Map<string, string>();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        get cookie() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); },
        set cookie(written: string) {
          const [pair, ...rest] = written.split('; ');
          const at = pair.indexOf('=');
          const name = pair.slice(0, at);
          if (rest.some(part => part === 'max-age=0')) jar.delete(name);
          else jar.set(name, pair.slice(at + 1));
        },
      },
    });
  });

  it('says nothing until somebody turns it on', () => {
    expect(announcedFolder()).toBeNull();
  });

  it('carries the folder and the programme, and nothing else', () => {
    announceFolder('wochenwerk', 'Lautstark');
    expect(announcedFolder()).toEqual({ app: 'wochenwerk', folder: 'Lautstark' });
    expect(document.cookie).not.toContain('=;');
  });

  it('survives a folder named with the separator in it', () => {
    announceFolder('wochenwerk', 'Familie | Ablage');
    expect(announcedFolder()?.folder).toBe('Familie | Ablage');
  });

  it('is taken back where it is switched off', () => {
    announceFolder('wochenwerk', 'Lautstark');
    stopAnnouncing();
    expect(announcedFolder()).toBeNull();
  });
});

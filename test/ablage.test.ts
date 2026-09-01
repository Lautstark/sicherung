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

const { Ablage } = await import('../src/ablage.js');

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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFolder, pickerFor } from './folder.js';

/*
 * The store is mocked here and only here.
 *
 * Not for speed: a directory handle survives `structuredClone` as a plain
 * object with its prototype gone, so a fake folder that went through
 * IndexedDB would come back without the very methods under test. Keeping the
 * handles in a Map is the only way `restore()` can be exercised at all. The
 * store's own round trip is tested against a real fake-indexeddb in
 * store.test.ts, where the value is plain data and clones honestly.
 */
const folders = new Map<string, unknown>();
const marks = new Map<string, { lastWrite: number | null; lastDated: string | null }>();

vi.mock('../src/store.js', () => ({
  readFolder: async (app: string) => folders.get(app) ?? null,
  writeFolder: async (app: string, folder: unknown) => { folders.set(app, folder); },
  forgetFolder: async (app: string) => { folders.delete(app); marks.delete(app); },
  readMark: async (app: string) => marks.get(app) ?? { lastWrite: null, lastDated: null },
  writeMark: async (app: string, mark: never) => { marks.set(app, mark); },
  close: async () => undefined,
}));

const { Sicherung } = await import('../src/index.js');

/** A clock the tests move by hand, so "one dated copy per day" is testable. */
function clock(start = Date.parse('2026-08-23T10:00:00')) {
  let at = start;
  return { now: () => at, advanceDays: (n: number) => { at += n * 86_400_000; } };
}

function make(folder: FakeFolder | null, options: Partial<{
  produce: () => Promise<unknown>; keep: number; settle: number; now: () => number;
}> = {}) {
  vi.stubGlobal('showDirectoryPicker', pickerFor(folder));
  return new Sicherung({
    app: 'testprodukt',
    produce: options.produce ?? (async () => ({ sentences: ['hallo'] })),
    keep: options.keep,
    settle: options.settle ?? 0,
    now: options.now,
  });
}

beforeEach(() => {
  folders.clear();
  marks.clear();
});

describe('capability', () => {
  it('reports unsupported where there is no picker', () => {
    vi.stubGlobal('showDirectoryPicker', undefined);
    const backup = new Sicherung({ app: 'testprodukt', produce: async () => ({}) });
    expect(Sicherung.supported).toBe(false);
    expect(backup.status).toEqual({ kind: 'unsupported' });
  });

  it('starts off, not idle, when supported but unconfigured', () => {
    const backup = make(new FakeFolder());
    expect(backup.status).toEqual({ kind: 'off' });
  });
});

describe('choosing a folder', () => {
  it('writes a first copy immediately rather than waiting for an edit', async () => {
    const folder = new FakeFolder();
    const backup = make(folder);

    const status = await backup.choose();

    expect(status.kind).toBe('idle');
    expect([...folder.files.keys()]).toContain('testprodukt-aktuell.json');
    expect(JSON.parse(folder.files.get('testprodukt-aktuell.json')!))
      .toEqual({ sentences: ['hallo'] });
  });

  it('writes a dated copy beside the current one', async () => {
    const folder = new FakeFolder();
    const time = clock();
    await make(folder, { now: time.now }).choose();

    expect([...folder.files.keys()].sort())
      .toEqual(['testprodukt-2026-08-23.json', 'testprodukt-aktuell.json']);
  });

  it('leaves the previous setup alone when the user cancels the picker', async () => {
    const backup = make(null);
    const status = await backup.choose();
    expect(status).toEqual({ kind: 'off' });
  });
});

describe('permission decay', () => {
  it('restores into needs-permission, keeping the age of the last real copy', async () => {
    const folder = new FakeFolder();
    const time = clock();
    await make(folder, { now: time.now }).choose();
    const wrote = marks.get('testprodukt')!.lastWrite;

    // What a browser restart looks like.
    folder.decay();
    const next = make(folder, { now: time.now });
    const status = await next.restore();

    expect(status.kind).toBe('needs-permission');
    // The number that tells somebody whether they are safe must survive.
    expect(status.kind === 'needs-permission' && status.lastWrite).toBe(wrote);
  });

  it('does not write while permission is pending, and says so instead of failing', async () => {
    const folder = new FakeFolder();
    await make(folder).choose();
    const before = folder.writes;

    folder.decay();
    const next = make(folder);
    await next.restore();
    const status = await next.save();

    expect(status.kind).toBe('needs-permission');
    expect(folder.writes).toBe(before);
  });

  it('resumes writing once confirm() is called from a gesture', async () => {
    const folder = new FakeFolder();
    await make(folder).choose();

    folder.decay('granted');
    const next = make(folder);
    await next.restore();
    const status = await next.confirm();

    expect(status.kind).toBe('idle');
  });

  it('stays in needs-permission when the user refuses the re-ask', async () => {
    const folder = new FakeFolder();
    await make(folder).choose();

    folder.decay('denied');
    const next = make(folder);
    await next.restore();

    expect((await next.confirm()).kind).toBe('needs-permission');
  });
});

describe('writing', () => {
  it('cuts one dated copy per day, not one per write', async () => {
    const folder = new FakeFolder();
    const time = clock();
    const backup = make(folder, { now: time.now });
    await backup.choose();
    await backup.save();
    await backup.save();

    const dated = [...folder.files.keys()].filter((n) => /\d{4}-\d{2}-\d{2}/.test(n));
    expect(dated).toEqual(['testprodukt-2026-08-23.json']);
  });

  it('prunes dated copies beyond keep, oldest first', async () => {
    const folder = new FakeFolder();
    const time = clock();
    const backup = make(folder, { now: time.now, keep: 3 });
    await backup.choose();
    for (let day = 0; day < 4; day++) { time.advanceDays(1); await backup.save(); }

    const dated = [...folder.files.keys()].filter((n) => /\d{4}-\d{2}-\d{2}/.test(n)).sort();
    expect(dated).toEqual([
      'testprodukt-2026-08-25.json',
      'testprodukt-2026-08-26.json',
      'testprodukt-2026-08-27.json',
    ]);
  });

  it('leaves the previous file whole when producing the payload throws', async () => {
    const folder = new FakeFolder();
    const backup = make(folder);
    await backup.choose();
    const good = folder.files.get('testprodukt-aktuell.json');

    const broken = make(folder, { produce: async () => { throw new Error('Datenbank zu'); } });
    await broken.choose();
    const status = await broken.save();

    expect(status.kind).toBe('failed');
    expect(status.kind === 'failed' && status.reason).toBe('Datenbank zu');
    expect(folder.files.get('testprodukt-aktuell.json')).toBe(good);
  });

  it('does not commit a half-written file when the write itself throws', async () => {
    const folder = new FakeFolder();
    const backup = make(folder);
    await backup.choose();
    const good = folder.files.get('testprodukt-aktuell.json');

    folder.failWrites = 'Kein Platz mehr';
    const status = await backup.save();

    expect(status.kind).toBe('failed');
    // abort(), not close() — the old copy is still there and still whole.
    expect(folder.files.get('testprodukt-aktuell.json')).toBe(good);
  });

  it('keeps the folder after a failure, because a full disk is not a wrong folder', async () => {
    const folder = new FakeFolder();
    const backup = make(folder);
    await backup.choose();
    folder.failWrites = 'Kein Platz mehr';
    await backup.save();

    folder.failWrites = null;
    expect((await backup.save()).kind).toBe('idle');
  });

  it('picks up an edit that arrived mid-write instead of dropping it', async () => {
    const folder = new FakeFolder();
    let version = 1;
    const backup = make(folder, { produce: async () => ({ version }) });
    await backup.choose();

    const first = backup.save();
    version = 2;
    const second = backup.save();
    await Promise.all([first, second]);

    expect(JSON.parse(folder.files.get('testprodukt-aktuell.json')!)).toEqual({ version: 2 });
  });

  it('does nothing at all when no folder is chosen', async () => {
    const backup = make(new FakeFolder());
    backup.schedule();
    expect((await backup.save()).kind).toBe('off');
  });
});

describe('forgetting', () => {
  it('drops the choice but leaves the written files where they are', async () => {
    const folder = new FakeFolder();
    const backup = make(folder);
    await backup.choose();

    expect((await backup.forget()).kind).toBe('off');
    expect(folders.has('testprodukt')).toBe(false);
    expect(folder.files.size).toBeGreaterThan(0);
  });
});

describe('the inlet', () => {
  /*
   * The METACOM rule made structural. This module may only ever write what a
   * product hands it, so the surface is checked as an allow-list: a method
   * that could read a database — or a constructor option naming one — would
   * show up here as a new name, and has to be argued for rather than merged.
   */
  it('exposes no way to read anything', () => {
    const surface = Object.getOwnPropertyNames(Sicherung.prototype)
      .filter((name) => name !== 'constructor')
      .sort();
    expect(surface).toEqual([
      'choose', 'confirm', 'forget', 'restore', 'save', 'schedule', 'status', 'subscribe',
    ]);
  });

  it('writes exactly what produce returned and nothing beside it', async () => {
    const folder = new FakeFolder();
    const payload = { format: 'bildhaft-backup', collections: [], notice: 'nur Verweise' };
    await make(folder, { produce: async () => payload }).choose();

    expect(JSON.parse(folder.files.get('testprodukt-aktuell.json')!)).toEqual(payload);
  });
});

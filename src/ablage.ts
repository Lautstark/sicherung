/*
 * A folder as the store, rather than as a copy of one.
 *
 * `Sicherung` beside this writes and cannot read: `produce()` is its only inlet
 * and `test/sicherung.test.ts` holds its prototype to an allow-list so that stays
 * true. That guarantee is worth keeping, and a reading method on that class would
 * end it for the three products that only ever needed to write — so the reading
 * half is a second object on its own subpath instead. See adr/0001.
 *
 * What this holds: a folder handle and the permission to use it. What it does not
 * hold: records. It moves them between a folder and the caller and keeps no copy,
 * because the mirror belongs to the product — `store.ts`'s database sits outside
 * the products' databases so that "delete all my data" cannot reach it, which is
 * right for a handle and would be catastrophic for a copy of somebody's calendar.
 */

import { readFolder, writeFolder, forgetFolder } from './store.js';
import type { AblageOptions, AblageStatus, Conflict, Change, Listed, Stored } from './types.js';

export type { AblageOptions, AblageStatus, Conflict, Change, Listed, Stored };

/** A directory handle, narrowed to what is used here. */
interface Dir extends FileSystemDirectoryHandle {
  keys?(): AsyncIterableIterator<string>;
}

/* A canonical record is `<id>.json`. A sync client that cannot merge writes a
   second file beside the first and decorates the stem — "x (conflicted copy
   2026-09-01).json" — so anything else carrying a known id is a candidate for it.
   This rule is reasoned about and has been tested against one client; see the
   open question in adr/0001 before trusting it against the others. */
const CANONICAL = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
const ANY_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export class Ablage {
  static get supported(): boolean {
    return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
  }

  #options: Required<Pick<AblageOptions, 'app' | 'kinds'>> & AblageOptions;
  #folder: Dir | null = null;
  #status: AblageStatus;
  #listeners = new Set<(status: AblageStatus) => void>();
  #seen = new Map<string, number>();
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AblageOptions) {
    this.#options = { ...options, app: options.app, kinds: options.kinds };
    this.#status = Ablage.supported ? { kind: 'off' } : { kind: 'unsupported' };
  }

  get status(): AblageStatus {
    return this.#status;
  }

  subscribe(listener: (status: AblageStatus) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  #announce(status: AblageStatus): AblageStatus {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
    return status;
  }

  /* The handle is keyed apart from the backup's. A folder somebody chose to
     receive copies is not a folder they agreed should hold the original, and
     scattering records into what a person thinks of as their backup folder
     would be this package deciding something they did not. */
  get #key(): string {
    return `ablage:${this.#options.app}`;
  }

  /* ------------------------------------------------------------- opening --- */

  /** Re-attach to a folder chosen on an earlier visit. Never prompts. */
  async restore(): Promise<AblageStatus> {
    if (!Ablage.supported) return this.#announce({ kind: 'unsupported' });
    const folder = (await readFolder(this.#key)) as Dir | null;
    if (!folder) return this.#announce({ kind: 'off' });
    this.#folder = folder;
    return this.#announce(
      (await this.#allowed('granted'))
        ? { kind: 'idle', folder: folder.name }
        : { kind: 'needs-permission', folder: folder.name },
    );
  }

  /** Open the picker. Must be called from a click. */
  async choose(): Promise<AblageStatus> {
    if (!Ablage.supported) return this.#announce({ kind: 'unsupported' });
    let folder: Dir;
    try {
      folder = (await (globalThis as unknown as {
        showDirectoryPicker(options: { mode: string }): Promise<Dir>;
      }).showDirectoryPicker({ mode: 'readwrite' }));
    } catch {
      // Somebody dismissing a picker has to cost nothing.
      return this.#status;
    }
    this.#folder = folder;
    await writeFolder(this.#key, folder);
    return this.#announce({ kind: 'idle', folder: folder.name });
  }

  /** Re-ask for a remembered folder. Must be called from a click. */
  async confirm(): Promise<AblageStatus> {
    if (!this.#folder) return this.#status;
    return this.#announce(
      (await this.#allowed('request'))
        ? { kind: 'idle', folder: this.#folder.name }
        : { kind: 'needs-permission', folder: this.#folder.name },
    );
  }

  /** Put the folder down. The files stay where they are. */
  async forget(): Promise<AblageStatus> {
    this.unwatch();
    await forgetFolder(this.#key);
    this.#folder = null;
    this.#seen.clear();
    return this.#announce(Ablage.supported ? { kind: 'off' } : { kind: 'unsupported' });
  }

  async #allowed(mode: 'granted' | 'request'): Promise<boolean> {
    const folder = this.#folder as unknown as {
      queryPermission?(o: unknown): Promise<PermissionState>;
      requestPermission?(o: unknown): Promise<PermissionState>;
    } | null;
    if (!folder) return false;
    const ask = { mode: 'readwrite' };
    try {
      const state = mode === 'granted'
        ? await folder.queryPermission?.(ask)
        : await folder.requestPermission?.(ask);
      return state === 'granted';
    } catch {
      return false;
    }
  }

  /* ------------------------------------------------------------- reading --- */

  /** The folder for one kind of record, made if it is not there yet. */
  async #dir(kind: string, create = false): Promise<Dir | null> {
    if (!this.#folder) return null;
    if (!this.#options.kinds.includes(kind)) throw new Error(`unknown kind: ${kind}`);
    try {
      const app = await this.#folder.getDirectoryHandle(this.#options.app, { create });
      return (await (app as Dir).getDirectoryHandle(kind, { create })) as Dir;
    } catch {
      return null;
    }
  }

  async #names(dir: Dir): Promise<string[]> {
    const names: string[] = [];
    const keys = dir.keys?.bind(dir);
    if (!keys) return names;
    for await (const name of keys()) if (name.endsWith('.json')) names.push(name);
    return names;
  }

  async #text(dir: Dir, name: string): Promise<string | null> {
    try {
      const file = await dir.getFileHandle(name);
      return await (await file.getFile()).text();
    } catch {
      return null;
    }
  }

  /** What is in one kind: each record's id and stamp, and nothing else. */
  async list(kind: string): Promise<Listed[]> {
    const dir = await this.#dir(kind);
    if (!dir) return [];
    const found: Listed[] = [];
    for (const name of await this.#names(dir)) {
      const canonical = CANONICAL.exec(name);
      if (!canonical) continue;
      const text = await this.#text(dir, name);
      const record = text && this.#parse(text);
      if (record) found.push({ id: canonical[1], updatedAt: Number(record.updatedAt) || 0 });
    }
    return found;
  }

  async read(kind: string, id: string): Promise<Stored | null> {
    const dir = await this.#dir(kind);
    if (!dir) return null;
    const text = await this.#text(dir, `${id}.json`);
    return text ? this.#parse(text) : null;
  }

  /** The startup read the product replaces its mirror from. */
  async all(kind: string): Promise<Stored[]> {
    const dir = await this.#dir(kind);
    if (!dir) return [];
    const records: Stored[] = [];
    for (const name of await this.#names(dir)) {
      if (!CANONICAL.test(name)) continue;
      const text = await this.#text(dir, name);
      const record = text && this.#parse(text);
      if (record) records.push(record);
    }
    return records;
  }

  #parse(text: string): Stored | null {
    try {
      const value = JSON.parse(text) as Stored;
      return value && typeof value === 'object' && typeof value.id === 'string' ? value : null;
    } catch {
      // A half-written or hand-edited file is not a crash: it is a file this
      // package does not recognise, and the ones beside it still read.
      return null;
    }
  }

  /* ------------------------------------------------------------- writing --- */

  /** Replace one record. It carries its own id and stamp; neither is minted here. */
  async write(kind: string, record: Stored): Promise<AblageStatus> {
    if (!record?.id) throw new Error('a record needs an id');
    if (this.#status.kind === 'stale') return this.#status;
    const dir = await this.#dir(kind, true);
    if (!dir) return this.#gone('the folder could not be opened');
    try {
      const file = await dir.getFileHandle(`${record.id}.json`, { create: true });
      const writable = await file.createWritable();
      await writable.write(JSON.stringify(record, null, 2));
      await writable.close();
      this.#seen.set(`${kind}/${record.id}`, Number(record.updatedAt) || 0);
      return this.#ok();
    } catch (error) {
      return this.#gone((error as Error)?.message ?? 'the write failed');
    }
  }

  async remove(kind: string, id: string): Promise<AblageStatus> {
    if (this.#status.kind === 'stale') return this.#status;
    const dir = await this.#dir(kind);
    if (!dir) return this.#gone('the folder could not be opened');
    try {
      await dir.removeEntry(`${id}.json`);
      this.#seen.delete(`${kind}/${id}`);
      return this.#ok();
    } catch (error) {
      return this.#gone((error as Error)?.message ?? 'the delete failed');
    }
  }

  #ok(): AblageStatus {
    return this.#announce({ kind: 'idle', folder: this.#folder?.name ?? '' });
  }

  /* A folder that has gone away is not an exception to catch: it is a state a
     panel draws, and the product serves its mirror read-only until it is back. */
  #gone(reason: string): AblageStatus {
    return this.#announce({ kind: 'stale', folder: this.#folder?.name ?? '', reason });
  }

  /* ------------------------------------------------------------ noticing --- */

  /** What changed since the last look. The product drives the rhythm. */
  async poll(): Promise<Change[]> {
    const changes: Change[] = [];
    const now = new Map<string, number>();
    for (const kind of this.#options.kinds) {
      for (const { id, updatedAt } of await this.list(kind)) {
        const key = `${kind}/${id}`;
        now.set(key, updatedAt);
        const before = this.#seen.get(key);
        if (before === undefined) changes.push({ kind, id, what: 'appeared' });
        else if (before !== updatedAt) changes.push({ kind, id, what: 'changed' });
      }
    }
    for (const key of this.#seen.keys()) {
      if (now.has(key)) continue;
      const [kind, id] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];
      changes.push({ kind, id, what: 'went' });
    }
    this.#seen = now;
    return changes;
  }

  /** A timer over `poll`, stopped by `forget()` or `unwatch()`. */
  watch(every: number, onChange: (changes: Change[]) => void): () => void {
    this.unwatch();
    this.#timer = setInterval(() => {
      void this.poll().then((changes) => { if (changes.length) onChange(changes); });
    }, every);
    return () => this.unwatch();
  }

  unwatch(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  /* ----------------------------------------------------------- conflicts --- */

  /** Every record a sync client left two of, with both stamps. Never picks. */
  async conflicts(): Promise<Conflict[]> {
    const found: Conflict[] = [];
    for (const kind of this.#options.kinds) {
      const dir = await this.#dir(kind);
      if (!dir) continue;
      const byId = new Map<string, { filename: string; updatedAt: number }[]>();
      for (const name of await this.#names(dir)) {
        const id = (CANONICAL.exec(name) ?? ANY_ID.exec(name))?.[1];
        if (!id) continue;
        const text = await this.#text(dir, name);
        const record = text && this.#parse(text);
        const list = byId.get(id) ?? [];
        list.push({ filename: name, updatedAt: record ? Number(record.updatedAt) || 0 : 0 });
        byId.set(id, list);
      }
      for (const [id, candidates] of byId) {
        if (candidates.length > 1) found.push({ kind, id, candidates });
      }
    }
    return found;
  }

  /** Keep one of a conflict's files and drop the others. The person chose. */
  async resolve(kind: string, id: string, filename: string): Promise<AblageStatus> {
    const dir = await this.#dir(kind);
    if (!dir) return this.#gone('the folder could not be opened');
    const text = await this.#text(dir, filename);
    const record = text && this.#parse(text);
    if (!record) return this.#gone(`could not read ${filename}`);
    await this.write(kind, { ...record, id });
    for (const name of await this.#names(dir)) {
      if (name === `${id}.json`) continue;
      if ((CANONICAL.exec(name) ?? ANY_ID.exec(name))?.[1] !== id) continue;
      await dir.removeEntry(name).catch(() => undefined);
    }
    return this.#ok();
  }
}

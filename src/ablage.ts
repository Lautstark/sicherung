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
import { put } from './put.js';
import type { AblageOptions, AblageStatus, Adoption, Conflict, Change, Listed, Stored, Written } from './types.js';

export type { AblageOptions, AblageStatus, Adoption, Conflict, Change, Listed, Stored, Written };

/** A directory handle whose `keys()` may be missing. TypeScript 6's lib.dom
 *  declares it; a browser without it still exists, and an older lib does not
 *  know it at all. An intersection rather than `extends`, because an optional
 *  member cannot extend the required one TypeScript 6 declares. */
type Dir = FileSystemDirectoryHandle & {
  keys?(): AsyncIterableIterator<string>;
};

/* A canonical record is `<id>.json`. A sync client that cannot merge writes a
   second file beside the first and decorates the stem — "x (conflicted copy
   2026-09-01).json" — so anything else carrying a known id is a candidate for it.
   This rule is reasoned about and has been tested against one client; see the
   open question in adr/0001 before trusting it against the others. */
const CANONICAL = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
/* What a file is called after its id. A folder somebody opens should show
   pictures and recordings, not a pile of `x.bin` — and the type is what a
   product already knows about its own bytes. Anything unrecognised keeps `bin`,
   which is honest rather than a guess. */
const ENDINGS: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/webm': 'webm',
  'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'application/pdf': 'pdf', 'text/plain': 'txt',
};
/* An id this package can find again.
 *
 * Everything that reads — `list`, `all`, `poll`, `adopt`'s check — goes by
 * `CANONICAL`, so a record under any other name was written, answered `idle`,
 * and was never seen again: not listed, not in the startup read, and `adopt`
 * stuck at `incomplete` for a reason nobody could see. conventions.md §1.1
 * already makes identity a `crypto.randomUUID()`, and the two stores whose keys
 * are not UUIDs hash them into one (adr/0001, "What the move settled"). So a
 * write that could never be read back is refused where it is made, loudly, as
 * a missing id already is — it is a wiring mistake, not a state of the folder. */
const filed = (id: string): void => {
  if (!CANONICAL.test(`${id}.json`)) {
    throw new TypeError(`a record's id must be a UUID to be found again, not "${id}"`);
  }
};

const endingFor = (type: string) => ENDINGS[type.toLowerCase().split(';')[0].trim()] ?? 'bin';

/* The mark that says this folder is a store. A plain name rather than a dotted
   one: sync clients treat dotfiles inconsistently, and this file has to travel. */
const MARK = 'adopted.json';

/* Telling the other Lautstark programmes which folder this one uses.
 *
 * Each product is its own origin, so a folder handle cannot travel between them
 * and nobody can be spared the file dialog — that is the browser's rule. What can
 * be spared is the wondering *which* folder, and a domain cookie is the only
 * thing that reaches across subdomains: shared storage in a hidden iframe stopped
 * working when browsers began partitioning it.
 *
 * Nothing here is ever called by this package. It is called because somebody
 * turned it on, which is what makes it lawful: §25 TDDDG allows storing on
 * somebody's device without consent only where it is strictly necessary for the
 * service they asked for, and a convenience hint is not. Consent is not a banner
 * — it is informed, specific, freely given and revocable — and a switch beside
 * the folder somebody just chose is all four, in the one place where the reader
 * knows what it means.
 *
 * A cookie rides along on every request to the site, so what it carries is the
 * folder's name and the product's, and nothing else. That is disclosed where the
 * switch is, because a person cannot consent to what they were not told. */
const SHARED = 'lautstark-ordner';
const OURS = 'lautstark.tech';
const forDomain = () => {
  const host = globalThis.location?.hostname ?? '';
  return host === OURS || host.endsWith(`.${OURS}`) ? `; domain=.${OURS}` : '';
};

export function announceFolder(app: string, folder: string): void {
  if (typeof document === 'undefined') return;
  const secure = globalThis.location?.protocol === 'https:' ? '; secure' : '';
  const value = encodeURIComponent(`${app}|${folder}`);
  document.cookie = `${SHARED}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}${forDomain()}`;
}

export function stopAnnouncing(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SHARED}=; path=/; max-age=0; samesite=lax${forDomain()}`;
}

export function announcedFolder(): { app: string; folder: string } | null {
  if (typeof document === 'undefined') return null;
  const found = document.cookie.split('; ').find(part => part.startsWith(`${SHARED}=`));
  if (!found) return null;
  const [app, ...rest] = decodeURIComponent(found.slice(SHARED.length + 1)).split('|');
  const folder = rest.join('|');
  return app && folder ? { app, folder } : null;
}

/* The one failure that means "not there" rather than "cannot get there". Every
   other error — no permission, a lock, a disk that went — is the second. */
const missing = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'NotFoundError';

const why = (error: unknown, otherwise: string): string =>
  (error as Error | null)?.message || otherwise;

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

  #version: number;
  /** The highest `v` read out of the folder so far. Absent means 1. */
  #newest = 1;

  constructor(options: AblageOptions) {
    this.#options = { ...options, app: options.app, kinds: options.kinds };
    this.#version = options.version ?? 1;
    this.#status = Ablage.supported ? { kind: 'off' } : { kind: 'unsupported' };
  }

  get status(): AblageStatus {
    return this.#status;
  }

  /**
   * The highest shape seen in the folder, and whether it is beyond this build.
   *
   * The Ablage crosses a machine boundary — a calendar on a laptop writes, a
   * board on a wall reads, and the wall does not reload for weeks. Everything
   * else in this family that crosses such a boundary carries a version; this did
   * not, because it reads as "our database, only on disk". It is a wire format.
   *
   * Answered from what has actually been read, so it means nothing before a read
   * has happened. A product asks after `all()` or `pullFromFolder()` and says so
   * where the person can see it; this package deliberately does not turn it into
   * a status, because refusing to draw is a product's decision and not a folder's.
   */
  get shape(): { writes: number; sawNewer: boolean } {
    return { writes: this.#version, sawNewer: this.#newest > this.#version };
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
    /* A follower reads and writes the leader's key: one folder, remembered
       once, with a subtree each. See `AblageOptions.follows`. */
    return `ablage:${this.#options.follows ?? this.#options.app}`;
  }

  /** Whether this Ablage is borrowing another's folder. */
  get #following(): boolean {
    return this.#options.follows !== undefined;
  }

  /** The app whose folder this one borrows, if it borrows one.
   *
   *  Public so that a panel can leave out what a follower may not do: offering
   *  a button that throws is offering an error, and `ablage-ui` and both panels
   *  read this rather than catching it after the press. */
  get follows(): string | undefined {
    return this.#options.follows;
  }

  /* The three calls a follower must not make.
   *
   * All three answer "which folder", and that answer belongs to whoever asked
   * the person for it. A follower choosing would move the leader's store; a
   * follower forgetting would drop it; a follower nesting would step the
   * leader's remembered folder one level down, because `nest` writes the
   * shared key — so every product following and the leader itself would open
   * a different, empty folder on their next start. None of these is a state a
   * caller could recover from by reading a status, so this is loud rather than
   * quiet: it is a wiring mistake, made once, at the point the Ablage is
   * constructed. */
  #refuse(verb: string): never {
    throw new TypeError(
      `Ablage "${this.#options.app}" follows "${this.#options.follows}" and cannot ${verb}(): `
      + `the folder belongs to "${this.#options.follows}".`,
    );
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
    if (this.#following) this.#refuse('choose');
    if (!Ablage.supported) return this.#announce({ kind: 'unsupported' });
    let folder: Dir;
    try {
      /* `id` is what makes the dialog open where it last stood rather than at
         some default. It is per origin, so it does nothing across products — but
         within one it turns "find that folder again" into a glance. */
      folder = (await (globalThis as unknown as {
        showDirectoryPicker(options: { mode: string; id?: string }): Promise<Dir>;
      }).showDirectoryPicker({ mode: 'readwrite', id: 'lautstark' }));
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
    if (this.#following) this.#refuse('forget');
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

  /* The app's own directory, above its kinds. Only the mark lives here — a
     product's records always live in a kind. */
  async #app(create = false): Promise<Dir | null> {
    if (!this.#folder) return null;
    try {
      return (await this.#folder.getDirectoryHandle(this.#options.app, { create })) as Dir;
    } catch {
      return null;
    }
  }

  /** The folder for one kind of record, made if it is not there yet.
   *
   *  `null` where there is no folder, where the kind has never been written —
   *  and where the folder could not be reached, which is said as `stale` here,
   *  so every reader that gets nothing back has a status that says why. */
  async #dir(kind: string, create = false): Promise<Dir | null> {
    if (!this.#folder) return null;
    if (!this.#options.kinds.includes(kind)) throw new Error(`unknown kind: ${kind}`);
    try {
      return await this.#reach(kind, create);
    } catch (error) {
      this.#gone(why(error, 'the folder could not be opened'));
      return null;
    }
  }

  /* The kind's folder, `null` if it is genuinely not there, and a throw if it
   * could not be reached.
   *
   * This used to be one `catch` that answered `null` to everything, and `null`
   * reads as *empty*. A folder the browser lost permission to, a disk that was
   * unplugged, a sync client holding a lock — each listed as no records, and
   * `poll` turned no records into every record having gone, with the status
   * still `idle`. A product doing what adr/0001 asks of it — the folder is the
   * truth, the mirror follows — then deleted its mirror to match. The household
   * would have been shown an empty week for a folder that was whole.
   *
   * So the one error that means "not there" is told apart from the rest.
   * `NotFoundError` for the kind is a kind nothing was written to yet, which is
   * empty and honestly so. `NotFoundError` for the app's own folder is the
   * same — unless the chosen folder above it has gone, because a folder that
   * was moved or deleted answers `NotFoundError` for everything inside it too.
   * Asking the chosen folder for its first name is what tells those apart. */
  async #reach(kind: string, create = false): Promise<Dir | null> {
    const root = this.#folder;
    if (!root) return null;
    let app: Dir;
    try {
      app = (await root.getDirectoryHandle(this.#options.app, { create })) as Dir;
    } catch (error) {
      if (!missing(error)) throw error;
      await root.keys?.().next();
      return null;
    }
    try {
      return (await app.getDirectoryHandle(kind, { create })) as Dir;
    } catch (error) {
      if (!missing(error)) throw error;
      return null;
    }
  }

  async #names(dir: Dir, ending = '.json'): Promise<string[]> {
    const names: string[] = [];
    const keys = dir.keys?.bind(dir);
    if (!keys) return names;
    for await (const name of keys()) if (name.endsWith(ending)) names.push(name);
    return names;
  }

  /* The name a record's file goes by, if it has one. Everything that is not the
     record itself and carries its id is it — which is how a file can be found
     again without the record having to remember what it was called. */
  async #fileFor(dir: Dir, id: string): Promise<string | null> {
    for (const name of await this.#names(dir, '')) {
      if (name !== `${id}.json` && name.startsWith(`${id}.`)) return name;
    }
    return null;
  }

  async #text(dir: Dir, name: string): Promise<string | null> {
    try {
      const file = await dir.getFileHandle(name);
      return await (await file.getFile()).text();
    } catch {
      return null;
    }
  }

  /** What is in one kind: each record's id and stamp, and nothing else.
   *  Empty where the folder could not be reached, with the status `stale`. */
  async list(kind: string): Promise<Listed[]> {
    if (!this.#options.kinds.includes(kind)) throw new Error(`unknown kind: ${kind}`);
    return (await this.#listed(kind)) ?? [];
  }

  /* `list`, with "could not reach" kept apart from "nothing there": `null` is
     the first, and `stale` has been said by the time it is returned. `poll`
     needs the difference, because an empty list is a list of what went. */
  async #listed(kind: string): Promise<Listed[] | null> {
    try {
      const dir = await this.#reach(kind);
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
    } catch (error) {
      this.#gone(why(error, 'the folder could not be read'));
      return null;
    }
  }

  async read(kind: string, id: string): Promise<Stored | null> {
    const dir = await this.#dir(kind);
    if (!dir) return null;
    const text = await this.#text(dir, `${id}.json`);
    return text ? this.#parse(text) : null;
  }

  /** The startup read the product replaces its mirror from.
   *
   *  Empty where the folder could not be reached — and then the status is
   *  `stale`, which is the product's cue to keep its mirror rather than replace
   *  it with nothing. An empty array alone cannot say which it is. */
  async all(kind: string): Promise<Stored[]> {
    const dir = await this.#dir(kind);
    if (!dir) return [];
    const records: Stored[] = [];
    try {
      for (const name of await this.#names(dir)) {
        if (!CANONICAL.test(name)) continue;
        const text = await this.#text(dir, name);
        const record = text && this.#parse(text);
        if (record) records.push(record);
      }
    } catch (error) {
      this.#gone(why(error, 'the folder could not be read'));
      return [];
    }
    return records;
  }

  #parse(text: string): Stored | null {
    try {
      const value = JSON.parse(text) as Stored;
      if (!value || typeof value !== 'object' || typeof value.id !== 'string') return null;
      /* A record written by a build that knows a shape this one does not. Read
         it anyway — refusing would empty a household's calendar over a field
         nobody needed — but remember, so the product can say so out loud rather
         than drawing a week it may have misread. */
      const wrote = Number(value.v) || 1;
      if (wrote > this.#newest) this.#newest = wrote;
      return value;
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
    filed(record.id);
    if (this.#status.kind === 'stale') return this.#status;
    const dir = await this.#dir(kind, true);
    if (!dir) return this.#unopened();
    try {
      /* `v` last, so it reads at the foot of the file rather than above the
         record's own fields — this is a file a person opens when something has
         gone wrong, and the shape number is not what they came for. */
      await put(dir, `${record.id}.json`, JSON.stringify({ ...record, v: this.#version }, null, 2));
      this.#seen.set(`${kind}/${record.id}`, Number(record.updatedAt) || 0);
      return this.#ok();
    } catch (error) {
      return this.#gone((error as Error)?.message ?? 'the write failed');
    }
  }

  async remove(kind: string, id: string): Promise<AblageStatus> {
    if (this.#status.kind === 'stale') return this.#status;
    const dir = await this.#dir(kind);
    /* A kind that was never written to holds nothing to remove, which is the
       state that was asked for; anything else `#dir` has already called stale.
       (The cast undoes a narrowing from the line above the await: `#dir` can
       have announced since.) */
    if (!dir) return this.#folder && (this.#status as AblageStatus).kind !== 'stale' ? this.#ok() : this.#unopened();
    try {
      /* Already gone is done, not failed. Removing is how a product follows a
         deletion — often one another device made, so the file has gone by the
         time this device catches up. Answering that with `stale` refused every
         write after it until somebody pressed a button, over a record that was
         exactly where the product wanted it: nowhere. */
      await dir.removeEntry(`${id}.json`).catch((error: unknown) => {
        if (!missing(error)) throw error;
      });
      /* A record's file has no life of its own; leaving it behind would be a
         picture nothing points at, filling a household's folder for years. */
      const file = await this.#fileFor(dir, id);
      if (file) await dir.removeEntry(file).catch(() => undefined);
      this.#seen.delete(`${kind}/${id}`);
      return this.#ok();
    } catch (error) {
      return this.#gone((error as Error)?.message ?? 'the delete failed');
    }
  }

  /* No folder to write into. Where `#dir` could not reach it, it has already
     said `stale` with the browser's own reason, and that is the better
     sentence; otherwise there was no folder at all. */
  #unopened(): AblageStatus {
    return this.#status.kind === 'stale' ? this.#status : this.#gone('the folder could not be opened');
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

  /* What a file manager would show at the top of the chosen folder.
   *
   * Products use it for two things and the package should stay ignorant of both:
   * deciding whether somebody has picked a folder that is already a Lautstark
   * one, and telling somebody what is actually in the folder when what they were
   * looking for is not. The second is the more valuable — "I put it there" and
   * "the app sees these three names" together turn a mystery into a comparison. */
  async folders(): Promise<string[]> {
    return this.#folder ? this.#subfolders(this.#folder) : [];
  }

  /* A directory inside the chosen folder that holds a child by this name.
   *
   * This is the one thing here that hands out a handle rather than records, and
   * it is worth being clear about why. A product that keeps its work in a folder
   * often has something else that wants a folder too — a picture source with its
   * own licensed set. Making somebody pick that a second time, on every device,
   * is the step where setting up is abandoned; letting them drop it beside the
   * work and finding it is the whole difference. No capability is gained: the
   * product could have picked this folder itself, and it is the product that
   * picked the one above it.
   *
   * Deliberately generous. Somebody who renames the folder, nests it a level too
   * deep, or drops the inner folder in directly should still be finished, so the
   * search goes by what is inside, two levels down, in any spelling. Being strict
   * here would only be convenience for us. */
  async folderHolding(child: string, depth = 2): Promise<{ name: string; handle: FileSystemDirectoryHandle } | null> {
    if (!this.#folder) return null;
    const wanted = child.toLowerCase();
    let level: Dir[] = [this.#folder];
    for (let step = 0; step <= depth && level.length; step++) {
      const next: Dir[] = [];
      for (const dir of level) {
        for (const name of await this.#subfolders(dir)) {
          if (name.toLowerCase() === wanted) return { name: dir.name, handle: dir };
          try { next.push((await dir.getDirectoryHandle(name)) as Dir); } catch { /* unreadable, skip */ }
        }
      }
      level = next;
    }
    return null;
  }

  async #subfolders(dir: Dir): Promise<string[]> {
    const entries = (dir as unknown as { values?: () => AsyncIterable<{ kind: string; name: string }> }).values;
    if (!entries) return [];
    const found: string[] = [];
    try {
      for await (const entry of entries.call(dir)) if (entry.kind === 'directory') found.push(entry.name);
    } catch {
      return [];
    }
    return found.sort();
  }

  /* Step into a directory inside the chosen one and keep that instead.
   *
   * The picker can only offer folders that exist, so somebody who has not made
   * one yet has to leave the browser, make it, and come back. This is the way
   * out: they pick where it should live, and the folder is made there. It is
   * also the difference between a tidy `Lautstark/` and a Dropbox root with
   * `wochenwerk/` and `bildhaft/` scattered through it — which is why the
   * product asks first, and why the package does not decide this by itself.
   *
   * Asking twice is asking once. This is a step in setting up, it takes as long
   * as a folder takes to make, and it is reached from a button — so the second
   * call is not a hypothesis: a household pressed the panel's button twice on
   * 2026-09-14 while the first press was still writing, and the store ended up
   * in `Lautstark/Lautstark` with an abandoned, unmarked half of one in
   * `Lautstark`. Unmarked is exactly what the next device reads as unclaimed.
   * `adopt` was written to survive being asked twice — it has the mark to look
   * at — and this was the step beside it that was not.
   *
   * Spelling is not held against anybody, for the same reason `folderHolding`
   * does not hold it against them: macOS and Windows answer a request for
   * `Lautstark` with the `lautstark` that is already there, so comparing byte
   * for byte would make a second level on exactly the machines where the first
   * folder was found. */
  async nest(name: string): Promise<AblageStatus> {
    if (this.#following) this.#refuse('nest');
    if (!this.#folder) return this.#status;
    /* Already standing in it. The folder is the one that was asked for, and it
       is already the remembered one — `choose` or an earlier `nest` wrote it. */
    if (this.#folder.name.toLowerCase() === name.toLowerCase()) return this.#status;
    try {
      const inside = (await this.#folder.getDirectoryHandle(name, { create: true })) as Dir;
      this.#folder = inside;
      await writeFolder(this.#key, inside);
      return this.#announce({ kind: 'idle', folder: inside.name });
    } catch (error) {
      return this.#gone((error as Error)?.message ?? 'the folder could not be made');
    }
  }

  /** Which programme this is, for a panel that has to draw its compartment. */
  get app(): string {
    return this.#options.app;
  }

  /* The folder somebody chose, for a product that has something else to put in
     it — its own snapshots, say.

     The only handle this class gives out apart from `folderHolding`, and worth
     the same sentence: no capability is gained by it. The product picked this
     folder, and could pick it again in one call; what it is spared is asking a
     household to pick the same folder twice under two names that look alike. */
  handle(): FileSystemDirectoryHandle | null {
    return this.#folder ?? null;
  }

  /* Whether this folder is already the store for this app.
   *
   * An empty store is a legitimate store — a household that adopted a folder and
   * then cleared it — so "has records in it" cannot answer this. A folder that is
   * not yet a store, and one that is halfway through becoming one, are the same
   * thing to a reader, and reading either back over a full local copy is how a
   * week gets deleted. It happened. The mark is what tells them apart. */
  async adopted(): Promise<boolean> {
    const app = await this.#app();
    return !!app && (await this.#text(app, MARK)) !== null;
  }

  /* Make this folder the store, from what the product hands over.
   *
   * Everything is written, then checked to be there, and only then is the mark
   * written — in that order, because a folder that looks like a store and holds a
   * fraction of one is worse than one that never claimed to be. A folder that is
   * already a store is refused rather than overwritten: connecting a shared folder
   * from a second machine must not push that machine's copy over everybody's. */
  async adopt(everything: Record<string, Stored[]>): Promise<Adoption> {
    if (await this.adopted()) return { adopted: false, reason: 'already', written: 0 };
    let written = 0;
    for (const [kind, records] of Object.entries(everything)) {
      const done = await this.writeAll(kind, records);
      written += done.written;
      if (done.missed.length) return { adopted: false, reason: 'incomplete', written };
    }
    for (const [kind, records] of Object.entries(everything)) {
      const there = new Set((await this.list(kind)).map(item => item.id));
      if (records.some(record => !there.has(record.id))) return { adopted: false, reason: 'incomplete', written };
    }
    const app = await this.#app(true);
    if (!app) { this.#gone('the folder could not be opened'); return { adopted: false, reason: 'unreachable', written }; }
    try {
      await put(app, MARK, JSON.stringify({ app: this.#options.app, at: Date.now() }, null, 2));
    } catch (error) {
      this.#gone((error as Error)?.message ?? 'the mark could not be written');
      return { adopted: false, reason: 'unreachable', written };
    }
    this.#ok();
    return { adopted: true, written };
  }

  /* Write many, and stop at the first that does not land.
   *
   * `write` answers with a status and never throws, which is right for one record
   * and a trap for a batch: once the folder is out of reach every later call
   * returns immediately having done nothing, so a loop over three thousand records
   * finishes quickly, silently, and with a folder holding a fraction of them. That
   * is not hypothetical — it is how a household lost its calendar. Stopping is the
   * point: what follows a failure would fail too, and reporting what did not land
   * is the only thing that lets a caller refuse to treat the folder as complete. */
  async writeAll(kind: string, records: Stored[]): Promise<Written> {
    let written = 0;
    for (let index = 0; index < records.length; index++) {
      const status = await this.write(kind, records[index]);
      if (status.kind === 'stale' || status.kind === 'failed') return { written, missed: records.slice(index) };
      written++;
    }
    return { written, missed: [] };
  }

  /* A file that belongs to a record — a picture, a recording — kept beside it
   * rather than inside it.
   *
   * A record is JSON, and JSON has no way to hold bytes: a Blob put through
   * `JSON.stringify` becomes `{}`, silently, which is a picture lost with no
   * error anywhere. Encoding it into the record instead would work and would
   * make every listing carry a megabyte of base64 to answer a question about
   * ids.
   *
   * So it lies beside the record under the same id, and keeps the extension its
   * type implies — a folder somebody opens should show pictures, not `x.bin`.
   * Nothing has to write the name down: whatever carries the id and is not the
   * record is the file. Deleting the record deletes it too. */
  async writeFile(kind: string, id: string, blob: Blob): Promise<AblageStatus> {
    filed(id);
    if (this.#status.kind === 'stale') return this.#status;
    const dir = await this.#dir(kind, true);
    if (!dir) return this.#unopened();
    try {
      const old = await this.#fileFor(dir, id);
      const name = `${id}.${endingFor(blob.type)}`;
      if (old && old !== name) await dir.removeEntry(old).catch(() => undefined);
      await put(dir, name, blob);
      return this.#ok();
    } catch (error) {
      return this.#gone((error as Error)?.message ?? 'the file could not be written');
    }
  }

  async readFile(kind: string, id: string): Promise<Blob | null> {
    const dir = await this.#dir(kind);
    if (!dir) return null;
    const name = await this.#fileFor(dir, id);
    if (!name) return null;
    try {
      return await (await (await dir.getFileHandle(name)).getFile());
    } catch {
      return null;
    }
  }

  /** Which records in a kind have a file beside them. */
  async withFiles(kind: string): Promise<string[]> {
    const dir = await this.#dir(kind);
    if (!dir) return [];
    const found = new Set<string>();
    for (const name of await this.#names(dir, '')) {
      const dot = name.lastIndexOf('.');
      if (dot > 0 && !name.endsWith('.json')) found.add(name.slice(0, dot));
    }
    return [...found].sort();
  }

  /** What changed since the last look. The product drives the rhythm. */
  async poll(): Promise<Change[]> {
    const changes: Change[] = [];
    const now = new Map<string, number>();
    for (const kind of this.#options.kinds) {
      /* A kind that could not be reached is not a kind that emptied. Reporting
         nothing — and keeping what was seen, so the next look that does reach
         it compares against the last one that did — is the only answer that
         cannot make a product delete records the folder still holds. The
         status says `stale`, which is where the product learns of it. */
      const listed = await this.#listed(kind);
      if (!listed) return [];
      for (const { id, updatedAt } of listed) {
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
    /* `poll` answers an unreachable folder with a status rather than a throw,
       but a timer is the one caller with nobody awaiting it: anything that does
       get through would be an unhandled rejection every few seconds, forever.
       It goes where the rest of this class's trouble goes — into the status.
       Only `poll`'s own failures, though: a product whose `onChange` throws has
       a bug of its own, and hiding it here would hide it from them. */
    this.#timer = setInterval(() => {
      void this.poll().then(
        (changes) => { if (changes.length) onChange(changes); },
        (error: unknown) => { this.#gone(why(error, 'the folder could not be read')); },
      );
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
    if (!dir) return this.#unopened();
    const text = await this.#text(dir, filename);
    const record = text && this.#parse(text);
    if (!record) return this.#gone(`could not read ${filename}`);
    /* Only what `write` answers says whether the chosen side is now the record.
       It answers rather than throws, so ignoring it reads like success: a store
       already `stale` returns before writing anything, a sync client holding
       the file makes the write fail — and in both cases the loop below went on
       to delete every other candidate, including the very file the person had
       just chosen, and then announced `idle` over it. The person picked which
       side survives; neither surviving is the one outcome they did not pick.
       So nothing is removed until the chosen side is in place, and a write
       that did not land is handed back as the status it is. */
    const wrote = await this.write(kind, { ...record, id });
    if (wrote.kind !== 'idle') return wrote;
    for (const name of await this.#names(dir)) {
      if (name === `${id}.json`) continue;
      if ((CANONICAL.exec(name) ?? ANY_ID.exec(name))?.[1] !== id) continue;
      await dir.removeEntry(name).catch(() => undefined);
    }
    return this.#ok();
  }
}

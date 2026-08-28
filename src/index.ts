/**
 * A backup that writes itself into a folder the user picked.
 *
 * The point is not the folder. The point is that a folder inside Dropbox,
 * iCloud Drive or Nextcloud is already synced by software the user installed
 * on purpose, so writing a file there is the whole of the cloud story — no
 * account, no token, no server of ours, nothing to revoke. What this module
 * does is small on purpose, and the smallness is the feature.
 *
 * ## What it cannot do, and why that is the design
 *
 * This module holds no database, no store, no reference to anything a product
 * keeps. The `produce` callback is the only way data enters it. That is a
 * structural guarantee rather than a promise in a comment: there is no code
 * path here that could read a symbol, a filename index or a cached image,
 * because there is nothing here to read them from.
 *
 * It matters because of METACOM. That collection is licensed per person, and
 * nothing derived from a user's folder may leave the browser — not even a list
 * of filenames. A folder inside Dropbox *is* somewhere else: writing there
 * hands the bytes to a sync client and then to a server. So the rule for every
 * product wiring this up is the same, and it is easy to hold because the
 * inlet is one function: pass the audited export, never a raw dump of a
 * database.
 *
 * ## Where it works
 *
 * Chromium on the desktop, and nowhere else. `showDirectoryPicker` is absent
 * from Safari and Firefox on every platform, and absent from every browser on
 * Android — including Chrome, because Android has no system picker that maps
 * onto the API. `Sicherung.supported` says so, and a product that asks is
 * expected to keep its ordinary download button for everyone else. This is a
 * convenience for whoever prepares the content on a laptop; it is not, and
 * must not be presented as, the backup story for a tablet.
 *
 * ## The failure worth designing for
 *
 * A stored handle survives a restart, but the browser may want the user to
 * confirm it again — and confirming needs a click we do not have at startup.
 * So the interesting state is not "broken", it is `needs-permission`: set up,
 * looks fine, writing nothing. A backup that silently stops is worse than no
 * backup, because it manufactures confidence. Every status here carries
 * `lastWrite` so a product can say how old the last real copy is, which is the
 * only number that actually tells somebody whether they are safe.
 */

import { forgetFolder, readFolder, readMark, writeFolder, writeMark } from './store.js';
import type { Options, Status } from './types.js';

export type { Options, Status } from './types.js';
export { close as closeStore } from './store.js';

type Permissioned = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
};

/**
 * `keys()` is part of the API in every browser that has the picker at all, but
 * TypeScript's DOM library still types `FileSystemDirectoryHandle` without the
 * async iterators. Narrowed to the one method used, so the day the lib catches
 * up this deletes cleanly instead of hiding a wider `any`.
 */
type Listable = FileSystemDirectoryHandle & {
  keys(): AsyncIterableIterator<string>;
};

/** Local, not UTC: a backup cut at 23:30 in Berlin belongs to that day. */
function dayStamp(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class Sicherung {
  readonly #app: string;
  readonly #stem: string;
  readonly #produce: () => Promise<unknown>;
  readonly #looksEmpty: ((produced: unknown) => boolean) | undefined;
  readonly #keep: number;
  readonly #settle: number;
  readonly #now: () => number;

  #folder: FileSystemDirectoryHandle | null = null;
  #status: Status;
  readonly #listeners = new Set<(status: Status) => void>();

  #timer: ReturnType<typeof setTimeout> | null = null;
  #writing: Promise<void> | null = null;
  /** An edit that arrived mid-write. One re-run is enough however many arrive. */
  #dirty = false;
  /** Set by confirmEmpty(), consumed by the write it permits. Never latched. */
  #allowEmpty = false;

  constructor(options: Options) {
    this.#app = options.app;
    this.#stem = options.stem ?? options.app;
    this.#produce = options.produce;
    this.#looksEmpty = options.looksEmpty;
    this.#keep = options.keep ?? 14;
    this.#settle = options.settle ?? 4000;
    this.#now = options.now ?? (() => Date.now());
    this.#status = Sicherung.supported ? { kind: 'off' } : { kind: 'unsupported' };
  }

  /** True where a folder can be chosen at all. Chromium desktop, in practice. */
  static get supported(): boolean {
    return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
  }

  get status(): Status {
    return this.#status;
  }

  /** Returns an unsubscribe, so a dialog that closes stops being told. */
  subscribe(listener: (status: Status) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #announce(status: Status): void {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }

  /* ----------------------------------------------------------- lifecycle --- */

  /**
   * Re-attaches to the remembered folder at startup. Never prompts: there is
   * no gesture here, so a folder needing re-confirmation lands in
   * `needs-permission` and waits for `confirm()` to be called from a click.
   */
  async restore(): Promise<Status> {
    if (!Sicherung.supported) return this.#status;

    const folder = await readFolder(this.#app);
    if (!folder) {
      this.#announce({ kind: 'off' });
      return this.#status;
    }

    this.#folder = folder;
    const { lastWrite } = await readMark(this.#app);
    const granted = await this.#has('granted');
    this.#announce(granted
      ? { kind: 'idle', folder: folder.name, lastWrite }
      : { kind: 'needs-permission', folder: folder.name, lastWrite });
    return this.#status;
  }

  /** Opens the picker. Must be called from a user gesture. */
  async choose(): Promise<Status> {
    const picker = (globalThis as {
      showDirectoryPicker?: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    if (!picker) {
      this.#announce({ kind: 'unsupported' });
      return this.#status;
    }

    let folder: FileSystemDirectoryHandle;
    try {
      folder = await picker({ mode: 'readwrite' });
    } catch {
      // The user closed the picker. Not an error, and not a state change:
      // whatever was set up before is still set up.
      return this.#status;
    }

    this.#folder = folder;
    await writeFolder(this.#app, folder);
    const { lastWrite } = await readMark(this.#app);
    this.#announce({ kind: 'idle', folder: folder.name, lastWrite });
    // A folder chosen and then not written to until the next edit would look
    // set up while holding nothing. Write immediately so the first copy exists.
    await this.save();
    return this.#status;
  }

  /** Re-asks for a remembered folder. Must be called from a user gesture. */
  async confirm(): Promise<Status> {
    if (!this.#folder) return this.restore();
    const { lastWrite } = await readMark(this.#app);
    if (!(await this.#has('request'))) {
      this.#announce({ kind: 'needs-permission', folder: this.#folder.name, lastWrite });
      return this.#status;
    }
    this.#announce({ kind: 'idle', folder: this.#folder.name, lastWrite });
    await this.save();
    return this.#status;
  }

  /**
   * Answers a `held`: yes, the emptiness is real, save it over the old copy.
   *
   * The other answer is not a method. Somebody who did *not* mean to empty
   * their library fixes the cause — opens the right address, signs back in —
   * and the next ordinary save goes through on its own, because the export
   * stops being empty. So there is only a button for the surprising answer,
   * and doing nothing is the safe one.
   *
   * Permission for one write, not a setting: `#allowEmpty` is consumed by the
   * save below, so the next empty export asks again. Somebody clearing one
   * collection today has not agreed to lose a different library next month.
   */
  async confirmEmpty(): Promise<Status> {
    if (!this.#folder) return this.#status;
    this.#allowEmpty = true;
    await this.save();
    return this.#status;
  }

  /** Drops the folder and the marks. The files already written stay where they are. */
  async forget(): Promise<Status> {
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null; }
    this.#folder = null;
    await forgetFolder(this.#app);
    this.#announce(Sicherung.supported ? { kind: 'off' } : { kind: 'unsupported' });
    return this.#status;
  }

  /* --------------------------------------------------------- permission --- */

  async #has(mode: 'granted' | 'request'): Promise<boolean> {
    const folder = this.#folder as Permissioned | null;
    if (!folder) return false;
    try {
      const query = (await folder.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (query === 'granted') return true;
      if (mode === 'granted') return false;
      return ((await folder.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted';
    } catch {
      return false;
    }
  }

  /* -------------------------------------------------------------- write --- */

  /**
   * Asks for a write once edits stop. Products call this on every change; the
   * debounce is what stops a keystroke becoming a file write.
   */
  schedule(): void {
    if (!this.#folder) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#timer = null; void this.save(); }, this.#settle);
  }

  /** Writes now, skipping the debounce. Safe to call concurrently. */
  async save(): Promise<Status> {
    if (!this.#folder) return this.#status;
    if (this.#writing) {
      // Already writing. Note that the data moved under us and let the run in
      // flight finish; it will pick the newer payload up on its own.
      this.#dirty = true;
      await this.#writing;
      return this.#status;
    }

    this.#writing = this.#run();
    try {
      await this.#writing;
    } finally {
      this.#writing = null;
    }
    return this.#status;
  }

  async #run(): Promise<void> {
    do {
      this.#dirty = false;
      const folder = this.#folder;
      if (!folder) return;

      const { lastWrite, lastDated, lastEmpty = false } = await readMark(this.#app);
      this.#announce({ kind: 'saving', folder: folder.name, lastWrite });

      if (!(await this.#has('granted'))) {
        // Not a failure. The folder is fine and the user has to click.
        this.#announce({ kind: 'needs-permission', folder: folder.name, lastWrite });
        return;
      }

      try {
        // produce() first and outside the write: a product that throws while
        // gathering its data should leave the previous file intact rather than
        // truncate it. This is also the only line through which anything the
        // product knows reaches this module.
        const produced = await this.#produce();
        const empty = this.#looksEmpty?.(produced) ?? false;

        // Nothing to save, over something worth keeping. Hold, and say so.
        //
        // Only when there is a copy to lose: with no previous write there is
        // nothing to protect and an empty first save is just an empty product.
        // And only when the copy on disk came from something non-empty, or
        // somebody who genuinely emptied their library would be asked again on
        // every save forever.
        //
        // `#allowEmpty` is the answer to being asked, and it is deliberately
        // one-shot: it is consumed by the write it permits, so the next empty
        // export asks again. A latch would turn one "yes, I meant it" into a
        // standing permission to overwrite, which is the thing this prevents.
        if (empty && !this.#allowEmpty && lastWrite !== null && !lastEmpty) {
          this.#announce({ kind: 'held', folder: folder.name, lastWrite });
          return;
        }
        this.#allowEmpty = false;

        const text = JSON.stringify(produced, null, 2);
        const at = this.#now();
        const stamp = dayStamp(at);

        await this.#put(folder, `${this.#stem}-aktuell.json`, text);
        // One dated copy per day. Dropbox keeps versions of its own, but a
        // folder on a plain disk does not, and this is the half that has to
        // work without a sync client under it.
        if (lastDated !== stamp) {
          await this.#put(folder, `${this.#stem}-${stamp}.json`, text);
          await this.#prune(folder);
        }

        await writeMark(this.#app, { lastWrite: at, lastDated: stamp, lastEmpty: empty });
        this.#announce({ kind: 'idle', folder: folder.name, lastWrite: at });
      } catch (error) {
        // The folder is kept. A full disk, a folder the user moved, a file
        // locked by the sync client — none of those mean the choice was wrong.
        this.#announce({
          kind: 'failed', folder: folder.name, lastWrite, reason: reason(error),
        });
        return;
      }
    } while (this.#dirty);
  }

  /**
   * One file, replaced.
   *
   * `createWritable()` is already atomic and nothing here needs to help it:
   * the browser writes to a swap file and swaps it in at `close()`, so a tab
   * killed mid-write leaves the previous copy whole rather than a half file.
   * Writing into the real file by hand — or building a temp-and-rename dance
   * on top — would be strictly worse, and `FileSystemDirectoryHandle` has no
   * rename to build it with anyway.
   */
  async #put(folder: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
    const file = await folder.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(text);
    } catch (error) {
      // Abort rather than close: closing would commit whatever did get
      // written, which is the truncation this whole method exists to avoid.
      await writable.abort?.().catch(() => undefined);
      throw error;
    }
    await writable.close();
  }

  /** Keeps the newest `keep` dated copies and removes the rest. */
  async #prune(folder: FileSystemDirectoryHandle): Promise<void> {
    const dated = new RegExp(`^${this.#stem}-(\\d{4}-\\d{2}-\\d{2})\\.json$`);
    const names: string[] = [];
    // Iterating a directory is the one place a folder can hold thousands of
    // unrelated files, so the match is anchored and the stem is ours.
    for await (const name of (folder as Listable).keys()) if (dated.test(name)) names.push(name);

    // Lexicographic sort is chronological for ISO day stamps, which is most of
    // why the filenames carry that shape.
    names.sort();
    for (const name of names.slice(0, Math.max(0, names.length - this.#keep))) {
      // A copy that will not delete is not worth failing a good write over.
      await folder.removeEntry(name).catch(() => undefined);
    }
  }
}

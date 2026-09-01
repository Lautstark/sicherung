/**
 * An in-memory stand-in for a chosen folder.
 *
 * It implements the parts of `FileSystemDirectoryHandle` this package touches
 * and nothing else, and it records how the writes were made — `committed` only
 * gains a file at `close()`, so a test can tell a truncating write from an
 * atomic one, which is the property `#put` exists to preserve.
 */

export class FakeWritable {
  #buffer = '';
  #closed = false;
  constructor(private readonly commit: (text: string) => void, private readonly fail?: string) {}

  async write(data: string): Promise<void> {
    if (this.fail) throw new Error(this.fail);
    this.#buffer += data;
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.commit(this.#buffer);
  }

  async abort(): Promise<void> {
    // Deliberately does not commit: that is the behaviour under test.
    this.#closed = true;
  }

  get closed(): boolean {
    return this.#closed;
  }
}

export class FakeFolder {
  readonly files = new Map<string, string>();
  /** Set to a message to make every write throw. */
  failWrites: string | null = null;
  /** Counts calls, so a test can prove a debounce coalesced. */
  writes = 0;
  #permission: PermissionState = 'granted';
  #granting: PermissionState = 'granted';

  constructor(readonly name = 'Sicherungen') {}

  /** Simulates the browser wanting the folder re-confirmed after a restart. */
  decay(onRequest: PermissionState = 'granted'): void {
    this.#permission = 'prompt';
    this.#granting = onRequest;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.#permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.#permission = this.#granting;
    return this.#granting;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<FakeWritable>;
  }> {
    if (!this.files.has(name) && !options?.create) throw new Error(`no such file: ${name}`);
    return {
      createWritable: async () => {
        this.writes++;
        return new FakeWritable((text) => this.files.set(name, text), this.failWrites ?? undefined);
      },
    };
  }

  async *keys(): AsyncGenerator<string> {
    for (const name of [...this.files.keys()]) yield name;
  }

  async removeEntry(name: string): Promise<void> {
    this.files.delete(name);
  }
}

/** The picker, answering with this folder. */
export function pickerFor(folder: FakeFolder | null): () => Promise<unknown> {
  return async () => {
    if (!folder) throw new Error('AbortError');
    return folder;
  };
}

/* A folder with folders in it, and files you can read back.
 *
 * `FakeFolder` above is flat and write-only, which is exactly what `Sicherung`
 * needs and exactly what `Ablage` cannot be tested against. Kept separate rather
 * than grown, so the tests that pin the backup's behaviour keep the fake they
 * were written for. */
export class FakeTree {
  readonly files = new Map<string, string>();
  readonly dirs = new Map<string, FakeTree>();
  failWrites: string | null = null;
  #permission: PermissionState = 'granted';
  #granting: PermissionState = 'granted';

  constructor(readonly name = 'Haushalt') {}

  decay(onRequest: PermissionState = 'granted'): void {
    this.#permission = 'prompt';
    this.#granting = onRequest;
  }
  async queryPermission(): Promise<PermissionState> { return this.#permission; }
  async requestPermission(): Promise<PermissionState> {
    this.#permission = this.#granting;
    return this.#granting;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeTree> {
    const there = this.dirs.get(name);
    if (there) return there;
    if (!options?.create) throw new Error(`no such directory: ${name}`);
    const made = new FakeTree(name);
    this.dirs.set(name, made);
    return made;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new Error(`no such file: ${name}`);
    return {
      getFile: async () => ({ text: async () => this.files.get(name) ?? '' }),
      createWritable: async () => new FakeWritable(
        (text) => this.files.set(name, text),
        this.failWrites ?? undefined,
      ),
    };
  }

  async *keys(): AsyncGenerator<string> {
    for (const name of [...this.files.keys()]) yield name;
  }
  async removeEntry(name: string): Promise<void> { this.files.delete(name); }

  /** What a sync client does when it cannot merge: a second file beside the first. */
  conflictOn(path: string, name: string, text: string): void {
    const [app, kind] = path.split('/');
    this.dirs.get(app)?.dirs.get(kind)?.files.set(name, text);
  }
  at(path: string): FakeTree | undefined {
    return path.split('/').reduce<FakeTree | undefined>((dir, part) => dir?.dirs.get(part), this);
  }
}

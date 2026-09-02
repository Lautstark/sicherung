/**
 * What a backup folder can be, said as a closed set so that a screen drawing
 * the state cannot forget a case. The status carries `lastWrite` in every
 * kind that has a folder at all — including the failing ones, because "it
 * broke" and "it broke and the last good copy is eleven days old" are
 * different sentences and only the second one is worth alarming somebody with.
 */
export type Status =
  /** No picker in this browser. Safari, Firefox, and every browser on Android. */
  | { kind: 'unsupported' }
  /** Supported, but nobody has chosen a folder. */
  | { kind: 'off' }
  /**
   * A folder is remembered and the browser wants it re-confirmed. This is the
   * normal state after a restart, not an error — but it is also the state in
   * which nothing is being written, which is why it is not folded into `idle`.
   */
  | { kind: 'needs-permission'; folder: string; lastWrite: number | null }
  /** Chosen, permitted, and not currently writing. */
  | { kind: 'idle'; folder: string; lastWrite: number | null }
  | { kind: 'saving'; folder: string; lastWrite: number | null }
  /** The last attempt threw. The folder is kept: a full disk is not a reason to forget it. */
  | { kind: 'failed'; folder: string; lastWrite: number | null; reason: string }
  /**
   * The export came back empty and the copy on disk is not, so nothing was
   * overwritten and the person has to say which of the two is right.
   *
   * This is the one status that is not about the folder. Everything else here
   * describes a place we cannot write to; this describes a write we chose not
   * to make. It exists because a backup cannot tell *"they deleted it"* from
   * *"this is not their data"* — both arrive as an empty export — and the two
   * want opposite answers. Seen in the wild on 2026-08-28: four sites moved to
   * new domains, browser storage is per origin, and every product opened on its
   * new address saw empty storage and faithfully saved that over the copy that
   * had the real thing in it. Nothing malfunctioned. The input was wrong.
   *
   * Held rather than failed, and it carries `lastWrite` like the rest, because
   * the sentence a person needs is "your last copy is from Tuesday and it is
   * still there" rather than "something went wrong".
   */
  | { kind: 'held'; folder: string; lastWrite: number | null };

export interface Options {
  /**
   * Which product this is — `bildhaft`, `mitreden`, `vorlaut`. Namespaces the
   * stored folder so two of them open in one browser cannot overwrite each
   * other's choice.
   */
  app: string;

  /**
   * Filename stem inside the chosen folder. Defaults to `app`.
   */
  stem?: string;

  /**
   * Produces the bytes to write, and is the **only** way data enters this
   * module — see the note at the top of index.ts. Whatever this returns is
   * JSON-stringified verbatim.
   */
  produce: () => Promise<unknown>;

  /**
   * Whether what `produce` just returned means *this product holds nothing*.
   *
   * Supplied by the product because only the product knows its own shape —
   * `collections` and `sentences` for bildhaft, `boards` for vorlaut. This
   * module deliberately holds no reference to anything a product keeps, and
   * naming those fields here would be the coupling it exists without.
   *
   * When this says yes and the copy on disk was written from something that
   * said no, the write is **held** rather than made: see `Status`'s `held`.
   * Leave it out and there is no guard, which is the honest default — a module
   * that guessed at emptiness would fail silently the day a product changed
   * shape, and an absent guard is at least visible in the call.
   *
   * It is called with the produced value, before serialising, so it sees the
   * object rather than a string.
   */
  looksEmpty?: (produced: unknown) => boolean;

  /** How many dated copies to keep beside the current one. Default 14. */
  keep?: number;

  /** How long to wait for edits to stop before writing, in ms. Default 4000. */
  settle?: number;

  /** Injectable clock, for tests. */
  now?: () => number;
}

/** What the store remembers per app, beside the folder handle itself. */
export interface Mark {
  lastWrite: number | null;
  /** The day-stamp of the newest dated copy, so one is cut per day and no more. */
  lastDated: string | null;
  /**
   * Whether what is on disk was written from an export the product called
   * empty. Remembered rather than re-derived, because the guard's question is
   * "is this a loss?" — and going from empty to empty is not one. Without it,
   * somebody who really has deleted everything would be asked again on every
   * save for the rest of the folder's life.
   *
   * Absent on marks written before this existed, which reads as `false`: the
   * copy on disk is treated as worth protecting, which is the safe way to be
   * wrong about it.
   */
  lastEmpty?: boolean;
}

/* --------------------------------------------------------------- Ablage --- */

/* A folder that is the store rather than a copy of one. The vocabulary is
   `Sicherung`'s wherever the word means the same thing, because @lautstark/design
   styles the state dot by name and a shared word is a shared dot for free. Two
   kinds are new, and they describe states a backup genuinely cannot be in. */
export type AblageStatus =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'needs-permission'; folder: string }
  | { kind: 'idle'; folder: string }
  | { kind: 'saving'; folder: string }
  | { kind: 'failed'; folder: string; reason: string }
  /** The folder is unreachable and the product is serving its mirror read-only. */
  | { kind: 'stale'; folder: string; reason: string }
  /** A sync client left two of something and a person has to say which. */
  | { kind: 'conflicted'; folder: string; ids: string[] };

export interface AblageOptions {
  /** Namespaces the subtree in the chosen folder, and the remembered handle. */
  app: string;
  /** One folder per kind of record. A product declares what it keeps. */
  kinds: readonly string[];
  now?: () => number;
}

/* The two fields this package learns. `Sicherung` knows nothing at all about what
   it writes; a filename has to come from somewhere, and a conflict cannot be
   reported without something to report about the two sides. conventions.md §1.1
   already makes identity a UUID and §1.4 already gives `updatedAt` a reader, so
   this is a filename convention rather than a new obligation. */
/** What `adopt` did, and where it stopped if it stopped. */
export interface Adoption {
  adopted: boolean;
  /** `already`: the folder is a store — read it rather than pushing over it.
      `incomplete`: not everything landed, so the folder was left unmarked.
      `unreachable`: everything landed but the mark could not be written. */
  reason?: 'already' | 'incomplete' | 'unreachable';
  written: number;
}

/** What a batch of writes achieved, and what it did not. */
export interface Written {
  written: number;
  /** The records from the first failure onward, none of which were written. */
  missed: Stored[];
}

export interface Stored {
  id: string;
  updatedAt: number;
  [field: string]: unknown;
}
export interface Listed {
  id: string;
  updatedAt: number;
}
export interface Change {
  kind: string;
  id: string;
  what: 'appeared' | 'changed' | 'went';
}
export interface Conflict {
  kind: string;
  id: string;
  candidates: { filename: string; updatedAt: number }[];
}

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
  | { kind: 'failed'; folder: string; lastWrite: number | null; reason: string };

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
}

/**
 * What the sheet is holding when the database a product found was not one it
 * can read. conventions.md §6.7.
 *
 * Two products had written this: bildhaft's `src/ui/rescue.svelte.ts` and
 * vorlaut-editor's `src/shell/rescue.svelte.ts`. Every record is still there,
 * untouched, at its own version, and nothing may happen next until the person
 * holding those records has them in a file. That is the whole of what this is
 * for, and in both products it is the only place a modal stops the page.
 *
 * Closing the sheet costs nothing, and that is the point rather than an
 * oversight: the database is exactly as it was and a reload asks again. The one
 * thing that must not be reachable without the file is the button that
 * discards, and `saved` is the whole of that enforcement.
 *
 * ## bildhaft's shape is the standard, on three counts
 *
 * **The count.** `held` is the number of records in the dump, and it is the one
 * fact that could change somebody's mind about whether the file is worth
 * keeping — §1.7's argument, that a question about destroying something names
 * what goes.
 *
 * **The said line is a region**, drawn from the first paint and empty. See
 * `RescueBody.svelte`.
 *
 * **Discarding can fail.** vorlaut's cannot report it: it closes the sheet
 * *before* discarding, so by the time the write refuses there is no region left
 * to report into and the boot has already restarted. The order here is the
 * other one — the sheet stays up until the discard has been through — and that
 * is a behaviour change rather than a port, named in §6.7 rather than
 * discovered by whoever adopts this.
 *
 * ## What stays with the product
 *
 * The words, because a shared component carries no German (§6.0), and because
 * both products interpolate the version into two of these sentences through
 * their own `t()`. The download itself, because the file's name is the
 * product's: "rettung" in one, `vorlaut-rettung-2026-09-17.json` in the other.
 * And what "again" means, which is the boot.
 *
 * Vorlaut's module also carries the sentence said after a *successful* upgrade,
 * whose timing its own e2e forced. That is not part of this and stays where it
 * is.
 *
 * ## Why this file is not called `rescue.svelte.ts`
 *
 * Both products call theirs that, and here it collides. TypeScript resolves
 * `./Rescue.svelte` by appending `.ts`, and on a case-insensitive filesystem —
 * every Mac in this family — `Rescue.svelte.ts` and `rescue.svelte.ts` are one
 * file: `error TS1149: File name … differs from already included file name
 * only in casing`, in the consumer's typecheck as much as in this package's.
 * The class is `Rescuing` and so is the module.
 */

/** The sentence for an error, without leaking an object into a paragraph. */
const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Every word this sheet says, in the product's own language.
 *
 * Positional arguments rather than a placeholder syntax, for `backup-panel.ts`'s
 * reason one directory up: this package has no i18n and is not growing one, and
 * a `{from}` convention here would be a third beside the two the products have.
 */
export interface RescueWords {
  /** The first paragraph, naming the version the database is stuck at. */
  body: (from: number | string) => string;
  /** How much is in the file. The count line. */
  holds: (count: number) => string;
  /** Said when the file has been taken. */
  saved: string;
  /** Said while the discard is running, which is why it is said at all: the
   *  sheet no longer closes first. */
  discarding: string;
  /** Said when the download or the discard refused. */
  failed: (reason: string) => string;
  /** The button that takes the file. */
  download: string;
  /** The button that destroys, naming the version that goes with it. */
  discard: (from: number | string) => string;
}

/** The two things only the product can do, and what to do afterwards. */
export interface RescueJobs {
  /** Hand the records to the person as a file, under the product's own name. */
  save: () => void | Promise<void>;
  /** Throw everything away. Anything it rejects with becomes a sentence. */
  discard: () => void | Promise<void>;
  /** Start the page again, once there is nothing left to start it from. */
  again: () => void;
}

/** What the sheet is holding and how far it has got. */
export class Rescuing {
  /** The sheet's own line of state. See `RescueBody` for why it is a region. */
  said = $state('');
  /** True once the file has been taken, which is what unlocks the discard. */
  saved = $state(false);
  /** A job is running. Disables both buttons, and false again after a discard
   *  that failed — because the sheet is still up and still offers both. */
  going = $state(false);

  /**
   * True once this sheet has closed itself, having discarded.
   *
   * **A plain field, and it must stay one.** Its only reader is the host's
   * `onClose`, which says "stopped" for a dismissal and nothing for this — so
   * nothing renders it and no effect depends on it. §6.7 records that the two
   * products' first reading conflated this with `going`, and they are different
   * questions: `going` is *a job is running* and is false again after a failed
   * discard, where a dismissal does mean the person walked away.
   */
  discarded = false;

  /** Closes the sheet. The host sets it; a sheet that never closes itself
   *  leaves it as the no-op it starts as. */
  close: () => void = () => undefined;

  constructor(
    /** The version the database is stuck at, which both sentences name. */
    readonly from: number | string,
    /** How many records the file would hold. */
    readonly held: number,
    readonly words: RescueWords,
    readonly jobs: RescueJobs,
  ) {}

  async save(): Promise<void> {
    try {
      await this.jobs.save();
      this.said = this.words.saved;
      // Only now. The file is the whole of what makes the button beside it
      // survivable.
      this.saved = true;
    } catch (failure) {
      this.said = this.words.failed(reason(failure));
    }
  }

  async discard(): Promise<void> {
    this.going = true;
    this.said = this.words.discarding;
    try {
      await this.jobs.discard();
    } catch (failure) {
      // The sheet is still up, which is the whole reason the close moved below
      // this. Both buttons come back: the file can be taken again, and so can
      // the discard.
      this.going = false;
      this.said = this.words.failed(reason(failure));
      return;
    }
    this.discarded = true;
    this.close();
    this.jobs.again();
  }
}

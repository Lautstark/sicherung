/**
 * The part of a standing-backup panel that is the same in every product, and
 * nothing else.
 *
 * All three products draw this panel, and all three had written it out: the
 * same six states, the same buttons against them, the same arithmetic turning
 * a timestamp into "vor 3 Minuten". Roughly a hundred and fifty lines each.
 * Most of that is *not* shared and is not here — see the note on strings
 * below — but the table of what to offer in which state is a behavioural
 * contract with three copies and nothing asserting they agree, which is the
 * arrangement where one of them quietly stops offering a way out of `failed`.
 *
 * ## No strings, and no DOM
 *
 * This module returns what to offer, never what to say or what to draw.
 *
 * Strings, because bildhaft has no `t()` and that is an argued position rather
 * than an omission — it turns *German* sentences into pictograms, so an
 * English shell would front a program that only understands German input. A
 * shared module that rendered text would force it to acquire exactly the
 * indirection it exists to refuse. So the product supplies the words, keyed by
 * `Action['id']`.
 *
 * DOM, because the two shapes are genuinely different: bildhaft builds nodes
 * and hands one back, while mitreden and vorlaut paint into markup that
 * already exists in their page. design.md §4.4 puts product layout on the
 * identity side of the line, and a helper that tried to serve both would be a
 * configuration object pretending to be a component.
 *
 * ## The one rule that is not code
 *
 * The status dot's attribute takes `status.kind` **verbatim**:
 *
 * ```
 * line.setAttribute('data-state', status.kind);
 * ```
 *
 * No mapping table in the product. A mapping is three chances to disagree
 * about what `failed` looks like, invisible until the day it matters, and
 * `@lautstark/design`'s components.css styles these kinds by name. An unknown
 * kind then falls back to the grey `off` dot and reads as *deliberately not
 * set up*, which is the honest failure: that is why adding a `Status` kind is
 * a major for the CSS as well as for this package.
 */

import type { Sicherung } from './index.js';
import type { Status } from './types.js';

/**
 * The four methods a panel may call, and no others.
 *
 * Structural rather than the class itself, so this module cannot reach
 * `restore()` or anything added to the class later. The inlet rule in
 * index.ts is held by a test asserting the prototype surface; this is the
 * same idea one layer out, enforced by the compiler.
 */
export type Actor = Pick<Sicherung, 'choose' | 'confirm' | 'save' | 'forget'>;

/**
 * Something to offer the user, given where the backup currently stands.
 *
 * `id` is a key, not a label — the product looks up its own word for it,
 * through `t()` or as a literal, in whatever language it has.
 */
export interface Action {
  id: 'choose' | 'confirm' | 'retry' | 'forget';
  /**
   * The one that leads, drawn as the primary button. At most one per status,
   * and `forget` is never it: leaving is not what the panel is encouraging.
   */
  primary: boolean;
  run: () => Promise<Status>;
}

/**
 * What to offer in each state. This is the table the three products had each
 * written out, and it is the reason this module exists.
 *
 * `saving` deliberately offers nothing. A write in flight settles in under a
 * second, and a button that appears for that long is a button people learn to
 * distrust rather than one they use. `unsupported` offers nothing either,
 * because a product is expected not to draw the panel at all there — the
 * download button beside it is the whole offer on a browser without a picker.
 *
 * `failed` keeps `forget` beside the retry. A folder that cannot be written
 * to may be one the user no longer wants, and the retry alone would corner
 * somebody whose disk is full.
 */
export function actionsFor(backup: Actor, status: Status): Action[] {
  const forget: Action = { id: 'forget', primary: false, run: () => backup.forget() };
  switch (status.kind) {
    case 'off':
      return [{ id: 'choose', primary: true, run: () => backup.choose() }];
    case 'needs-permission':
      return [{ id: 'confirm', primary: true, run: () => backup.confirm() }, forget];
    case 'failed':
      return [{ id: 'retry', primary: true, run: () => backup.save() }, forget];
    case 'idle':
      return [forget];
    case 'saving':
    case 'unsupported':
      return [];
  }
}

/**
 * Whether this state is one the person has to do something about.
 *
 * The sibling of `actionsFor` above, and here for the same reason: it is a
 * decision every product was making for itself, out of the same status, and
 * getting differently. All three drew `needs-permission` as one more line of
 * grey prose beside "gesichert vor 3 Minuten" — which is what it looks like
 * when a product judges the state rather than reads it.
 *
 * `needs-permission` and `failed` are true, and the difference between them is
 * not the point. What they share is the only thing a panel needs to know: **no
 * backup is being written, and it will not resume by itself.** A browser
 * withdrawing the permission on a stored folder is ordinary — Chromium does it
 * between visits, nothing is lost, and one press puts it back — but "ordinary"
 * is about whose fault it is, not about whether somebody has to act.
 *
 * `off` is false, deliberately. Nobody has chosen a folder, so nothing is
 * broken and nothing is owed; a product that wants to encourage the choice has
 * `actionsFor`'s primary button for that. `saving` and `idle` are working, and
 * `unsupported` is a panel the product should not be drawing at all.
 *
 * What a product does with a true is its own: `components.css`'s `.notice.bad`
 * is what the family draws, and conventions.md §3.7 says what the words have to
 * cover.
 */
export const needsAttention = (status: Status): boolean =>
  status.kind === 'needs-permission' || status.kind === 'failed';

/**
 * The boundaries at which "how long ago" changes unit, and the divisor for
 * each. Ordered, and read by taking the first whose limit the gap is under.
 */
const STEPS: [limit: number, unit: Intl.RelativeTimeFormatUnit, per: number][] = [
  [60_000, 'second', 1000],
  [3_600_000, 'minute', 60_000],
  [86_400_000, 'hour', 3_600_000],
  [604_800_000, 'day', 86_400_000],
  [2_629_800_000, 'week', 604_800_000],
  [Number.POSITIVE_INFINITY, 'month', 2_629_800_000],
];

/**
 * "vor 3 Minuten", "3 minutes ago" — the arithmetic, in whichever language is
 * asked for.
 *
 * **The formatter is built per call and must never be cached here.** That is
 * not a style preference: mitreden changes language without reloading the
 * page, and a formatter captured once would go on answering in the language
 * the reader has just left. It would look right in every test — the string is
 * still a well-formed relative time — and be wrong only for the person who
 * switched. The cost is one `Intl` construction per status change, which
 * happens when a backup is written, not in a loop.
 *
 * A gap in the future is clamped to zero rather than rendered as "in 3
 * seconds": clocks disagree by a few seconds across a sync, and a backup
 * claiming to be from the future is alarming out of all proportion to a
 * skewed clock.
 */
export function ago(at: number, locale: string, now = Date.now()): string {
  const gap = Math.max(0, now - at);
  const [, unit, per] = STEPS.find(([limit]) => gap < limit)!;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    .format(-Math.round(gap / per), unit);
}

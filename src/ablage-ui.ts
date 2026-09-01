/*
 * What a panel for a folder-as-store says and offers.
 *
 * The same reasoning as `ui.ts` beside it: this package answers what the state
 * *is* and what can be *done* about it, and the product supplies the words. Three
 * copies of "which button does a folder that lost permission get" is three chances
 * to disagree, and the products had disagreed before `actionsFor` existed.
 *
 * Separate from `ui.ts` for the same reason `Ablage` is separate from `Sicherung`:
 * a `Line` key added here would be a compile error in the three products that
 * only ever back up, and none of them has a store in a folder.
 */

import type { Ablage } from './ablage.js';
import type { AblageStatus } from './types.js';

export type Keeper = Pick<Ablage, 'choose' | 'confirm' | 'forget'>;

export interface AblageAction {
  id: 'choose' | 'confirm' | 'retry' | 'forget';
  primary: boolean;
  run: () => Promise<AblageStatus>;
}

/** Which states are somebody's to act on. */
export const needsAttention = (status: AblageStatus): boolean =>
  status.kind === 'needs-permission' || status.kind === 'failed'
  || status.kind === 'stale' || status.kind === 'conflicted';

export function actionsFor(store: Keeper, status: AblageStatus): AblageAction[] {
  const choose: AblageAction = { id: 'choose', primary: true, run: () => store.choose() };
  const forget: AblageAction = { id: 'forget', primary: false, run: () => store.forget() };
  switch (status.kind) {
    case 'unsupported': return [];
    case 'off': return [choose];
    // One press puts a withdrawn permission back, and nothing has been lost —
    // which is why this is the primary and not a warning with a button under it.
    case 'needs-permission':
      return [{ id: 'confirm', primary: true, run: () => store.confirm() }, forget];
    // A folder that has gone away is answered by pointing at it again, not by
    // retrying a write into somewhere that is not there.
    case 'stale':
    case 'failed':
      return [{ id: 'retry', primary: true, run: () => store.confirm() }, choose, forget];
    // Nothing here resolves a conflict: which file survives is a question about
    // two records, and it belongs beside the records rather than in a panel.
    case 'conflicted':
    case 'saving':
    case 'idle':
      return [choose, forget];
  }
}

export type AblageLine =
  | { key: 'none' }
  | { key: 'off' }
  | { key: 'saving' }
  | { key: 'idle'; folder: string }
  | { key: 'needs-permission'; folder: string }
  | { key: 'failed'; folder: string; reason: string }
  | { key: 'stale'; folder: string; reason: string }
  | { key: 'conflicted'; folder: string; count: number };

export function lineFor(status: AblageStatus): AblageLine {
  switch (status.kind) {
    case 'unsupported': return { key: 'none' };
    case 'off': return { key: 'off' };
    case 'saving': return { key: 'saving' };
    case 'idle': return { key: 'idle', folder: status.folder };
    case 'needs-permission': return { key: 'needs-permission', folder: status.folder };
    case 'failed': return { key: 'failed', folder: status.folder, reason: status.reason };
    // Not "something went wrong": the records are still whole, in a folder this
    // browser cannot reach. What the product is doing meanwhile — serving its
    // mirror and taking no writes — is the thing a person needs told.
    case 'stale': return { key: 'stale', folder: status.folder, reason: status.reason };
    case 'conflicted':
      return { key: 'conflicted', folder: status.folder, count: status.ids.length };
  }
}

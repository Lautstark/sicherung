/**
 * Where the folder choice and the last-write mark are kept.
 *
 * A directory handle is a structured-cloneable object, so IndexedDB stores it
 * directly — and what is stored is a *capability*, not a path string we could
 * re-open ourselves. That distinction is the reason this is safe to keep: the
 * handle is worth nothing in another browser profile, and it grants exactly
 * what the user granted, no more.
 *
 * Its own database rather than a table inside each product's. The products
 * delete their databases — bildhaft's "alle Daten löschen", vorlaut's reset —
 * and a backup folder that had to be re-chosen after every reset would be a
 * backup nobody keeps set up. Forgetting the folder is its own decision, so
 * it lives somewhere the reset does not reach.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Mark } from './types.js';

interface SicherungDB extends DBSchema {
  /** Keyed by app name. */
  folders: { key: string; value: FileSystemDirectoryHandle };
  marks: { key: string; value: Mark };
}

const DB_NAME = 'lautstark-sicherung';
const DB_VERSION = 1;

let handle: Promise<IDBPDatabase<SicherungDB>> | null = null;

function db(): Promise<IDBPDatabase<SicherungDB>> {
  handle ??= openDB<SicherungDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('folders')) database.createObjectStore('folders');
      if (!database.objectStoreNames.contains('marks')) database.createObjectStore('marks');
    },
  });
  return handle;
}

export async function readFolder(app: string): Promise<FileSystemDirectoryHandle | null> {
  // A browser with no IndexedDB at all, or one refusing to open it in a private
  // window, means no remembered folder — not a crash on startup.
  try {
    return (await (await db()).get('folders', app)) ?? null;
  } catch {
    return null;
  }
}

export async function writeFolder(app: string, folder: FileSystemDirectoryHandle): Promise<void> {
  await (await db()).put('folders', folder, app);
}

export async function forgetFolder(app: string): Promise<void> {
  const database = await db();
  await database.delete('folders', app);
  await database.delete('marks', app);
}

const BLANK: Mark = { lastWrite: null, lastDated: null };

export async function readMark(app: string): Promise<Mark> {
  try {
    return (await (await db()).get('marks', app)) ?? BLANK;
  } catch {
    return BLANK;
  }
}

export async function writeMark(app: string, mark: Mark): Promise<void> {
  await (await db()).put('marks', mark, app);
}

/** Test seam. The single connection is module state and outlives a test file otherwise. */
export async function close(): Promise<void> {
  if (!handle) return;
  (await handle).close();
  handle = null;
}

/**
 * One file, replaced — the one way anything in this package writes a file.
 *
 * `createWritable()` is already atomic and nothing here needs to help it: the
 * browser writes to a swap file and swaps it in at `close()`, so a tab killed
 * mid-write leaves the previous copy whole rather than a half file. Writing
 * into the real file by hand — or building a temp-and-rename dance on top —
 * would be strictly worse, and `FileSystemDirectoryHandle` has no rename to
 * build it with anyway.
 *
 * What the atomicity does not cover is a write that *throws*: the swap file is
 * still open, and closing it — which is what the obvious `finally` does —
 * commits whatever did get written. That is the truncation the swap file exists
 * to prevent, so a failure aborts instead. This sequence had been written out
 * four times, once in `Sicherung` and three times in `Ablage`, and only the
 * first copy aborted; a record or a picture that failed half-way was closed
 * over the good one. One function is the only arrangement in which a fifth
 * caller cannot forget.
 *
 * Internal. Not an export of the package, and `Sicherung`'s allow-list is not
 * touched by it: a module-level function is not a name on the prototype, and it
 * writes what it is handed and reads nothing.
 */
export async function put(
  folder: FileSystemDirectoryHandle,
  name: string,
  data: string | Blob,
): Promise<void> {
  const file = await folder.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(data);
  } catch (error) {
    // Abort rather than close: closing would commit whatever did get
    // written, which is the truncation this whole function exists to avoid.
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
  await writable.close();
}

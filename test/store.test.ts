import { afterEach, describe, expect, it } from 'vitest';
import { close, forgetFolder, readFolder, readMark, writeFolder, writeMark } from '../src/store.js';

/*
 * Against a real (fake-indexeddb) database, with a plain object standing in for
 * the handle. A handle is structured-cloneable, which is the property that lets
 * it be stored at all, so a plain object is a fair stand-in for what survives.
 */
const handle = { name: 'Sicherungen' } as unknown as FileSystemDirectoryHandle;

afterEach(async () => {
  await forgetFolder('a');
  await forgetFolder('b');
  await close();
});

describe('store', () => {
  it('round-trips a folder', async () => {
    await writeFolder('a', handle);
    expect((await readFolder('a'))?.name).toBe('Sicherungen');
  });

  it('keeps each product apart, so two open tabs cannot overwrite each other', async () => {
    await writeFolder('a', { name: 'Eins' } as unknown as FileSystemDirectoryHandle);
    await writeFolder('b', { name: 'Zwei' } as unknown as FileSystemDirectoryHandle);

    expect((await readFolder('a'))?.name).toBe('Eins');
    expect((await readFolder('b'))?.name).toBe('Zwei');
  });

  it('answers with nothing for a product that has never chosen', async () => {
    expect(await readFolder('a')).toBeNull();
    expect(await readMark('a')).toEqual({ lastWrite: null, lastDated: null });
  });

  it('forgets the mark along with the folder', async () => {
    await writeFolder('a', handle);
    await writeMark('a', { lastWrite: 1, lastDated: '2026-08-23' });
    await forgetFolder('a');

    expect(await readFolder('a')).toBeNull();
    expect(await readMark('a')).toEqual({ lastWrite: null, lastDated: null });
  });
});

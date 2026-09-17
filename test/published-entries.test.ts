// @vitest-environment jsdom
/*
 * The components are held to what a consumer can actually hand them.
 *
 * This file exists because the package was green while every consumer was red,
 * and the reason was in the suite rather than in the components. Until
 * 2026-09-17 the components imported `../src/...` and so did the tests, so the
 * two agreed with each other and with nobody else: `exports["."]` points at
 * `dist`, `tsc` writes `#private;` into a class's declaration, and the built
 * class and the source class are therefore nominally distinct. A product's own
 * object could not be passed in —
 *
 *     Type 'Ablage' is missing the following properties from type 'Ablage':
 *       #options, #folder, #status, #listeners, and 18 more.
 *
 * — and there was no honest fix on the consumer's side, because `exports` has
 * no `./src/*` entry to import the other one from.
 *
 * So the rule is: **a component imports what a consumer imports**, and the two
 * tests below are the two ways of asking whether it still does.
 *
 * **The call sites are the valuable half.** `mount` is called here the way a
 * product calls it — a real `Sicherung` and a real `Ablage` from the published
 * entries, passed straight in with no cast. `test/css-contract.test.ts` cannot
 * ask this question however it imports, because its stubs go in through
 * `as unknown as Sicherung` and a stub object, which is right for what that
 * file checks and erases exactly the identity this one is about. The check that
 * fails is not vitest's, which never sees a type: it is `svelte-check`, which
 * is why `tsconfig.svelte.json` reaches into `test/` for this file.
 *
 * **The reading half catches it sooner and says why.** A regression here is one
 * character of a specifier, and the type error it produces names the same class
 * twice and is read as nonsense by anyone who has not met it before. So the
 * first test reads the specifiers themselves and fails with the rule.
 *
 * Neither test is about markup. Nothing here asserts a word or a class name —
 * §4.12's contract is `test/css-contract.test.ts`'s and stays there.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Ablage } from '../dist/ablage.js';
import { Sicherung } from '../dist/index.js';
import AblagePanel from '../svelte/AblagePanel.svelte';
import BackupPanel from '../svelte/BackupPanel.svelte';

/* From the working directory rather than from `import.meta.url`: this file
   runs under jsdom, where vite rewrites `import.meta.url` to an http URL and
   `fileURLToPath` refuses it. vitest runs from the package root. */
const shipped = join(process.cwd(), 'svelte');
const files = readdirSync(shipped).filter((name) => /\.(svelte|ts)$/.test(name));

/** Every relative specifier that leaves `svelte/`, per file. */
function leaving(name: string): string[] {
  const source = readFileSync(join(shipped, name), 'utf8');
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"](\.\.\/[^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('a shipped component imports what a consumer imports', () => {
  it('there are components to check', () => {
    expect(files.length).toBeGreaterThan(4);
  });

  it.each(files)('%s reaches out of svelte/ only into dist/', (name) => {
    const wrong = leaving(name).filter((specifier) => !specifier.startsWith('../dist/'));
    // Reads, when it fails: svelte/AblagePanel.svelte → ['../src/ablage.js'].
    expect({ [name]: wrong }).toEqual({ [name]: [] });
  });
});

describe('the published classes are what the panels take', () => {
  const live: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    for (const app of live.splice(0)) void unmount(app);
    document.body.replaceChildren();
  });

  function target(): HTMLElement {
    const node = document.createElement('div');
    document.body.append(node);
    return node;
  }

  it('BackupPanel takes a Sicherung built from the package entry', () => {
    // A picker that refuses: enough for `supported`, so the panel draws rather
    // than answering the unsupported browser's nothing.
    (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker =
      async () => { throw new Error('AbortError'); };
    const backup = new Sicherung({ app: 'published-entries', produce: async () => ({}) });
    const node = target();
    // No cast. This is the line svelte-check fails on when a component goes
    // back to `../src/`, with bildhaft's message.
    live.push(mount(BackupPanel, { target: node, props: { backup, say: () => {} } }));
    flushSync();
    expect(node.querySelector('.backup-panel')).not.toBe(null);
  });

  it('AblagePanel takes an Ablage built from the package entry', () => {
    const store = new Ablage({ app: 'published-entries', kinds: ['termine'] });
    const node = target();
    // No cast, for the same reason.
    live.push(mount(AblagePanel, {
      target: node,
      props: {
        store,
        adopt: async (): Promise<'pushed'> => 'pushed',
        changed: () => {},
        say: () => {},
      },
    }));
    flushSync();
    expect(node.querySelector('.where-panel')).not.toBe(null);
  });
});

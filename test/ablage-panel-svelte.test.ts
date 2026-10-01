// @vitest-environment jsdom
/*
 * The Svelte twin of `ablage-panel.test.ts`, for the three things the two were
 * found to get wrong together: a picker somebody closed, a follower offered
 * what it cannot do, and a press whose work throws.
 *
 * The store is a stub, as in css-contract: what is under test is what the
 * component does with the answers it is given, and a stub can give exactly the
 * answer a dismissed picker gives — the status it already had, and the handle
 * it already held.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AblageStatus } from '../dist/ablage.js';
import AblagePanel from '../svelte/AblagePanel.svelte';

const settled = () => new Promise((done) => setTimeout(done, 0));

function stub(status: AblageStatus, extra: Record<string, unknown> = {}) {
  const held = {};
  return {
    app: 'wochenwerk',
    follows: undefined as string | undefined,
    get status() { return status; },
    subscribe(listener: (next: AblageStatus) => void) { listener(status); return () => {}; },
    choose: vi.fn(async () => status),
    confirm: vi.fn(async () => status),
    forget: vi.fn(async () => status),
    nest: async () => status,
    handle: () => held,
    folders: async () => [],
    adopted: async () => true,
    ...extra,
  };
}

const live: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const app of live.splice(0)) void unmount(app);
  document.body.replaceChildren();
});

function render(props: Record<string, unknown>): HTMLElement {
  const target = document.createElement('div');
  document.body.append(target);
  live.push(mount(AblagePanel as never, { target, props: props as never }));
  flushSync();
  return target;
}

const labels = (node: HTMLElement) => [...node.querySelectorAll('button')].map((b) => b.textContent);
const click = (node: HTMLElement, label: string) =>
  [...node.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

describe('svelte/AblagePanel', () => {
  it('costs nothing when the picker behind „Anderer Ordner“ is closed', async () => {
    const store = stub({ kind: 'idle', folder: 'Haushalt' });
    const adopt = vi.fn(async () => 'pulled' as const);
    const changed = vi.fn();
    const say = vi.fn();
    const node = render({ store, adopt, changed, say });
    click(node, 'Anderer Ordner');
    await settled();
    expect(store.choose).toHaveBeenCalledTimes(1);
    expect(adopt).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
  });

  it('offers a follower neither a different folder nor forgetting it', () => {
    const idle = render({
      store: stub({ kind: 'idle', folder: 'Haushalt' }, { follows: 'bildhaft' }),
      adopt: async () => 'pushed', changed: () => {}, say: () => {},
    });
    expect(labels(idle)).toEqual([]);
    const off = render({
      store: stub({ kind: 'off' }, { follows: 'bildhaft' }),
      adopt: async () => 'pushed', changed: () => {}, say: () => {},
    });
    expect(labels(off)).toEqual([]);
  });

  it('tries again for a follower by asking, not by picking', async () => {
    const store = stub({ kind: 'stale', folder: 'Haushalt', reason: 'x' }, { follows: 'bildhaft' });
    const node = render({ store, adopt: async () => 'pushed', changed: () => {}, say: () => {} });
    expect(labels(node)).toEqual(['Nochmal versuchen']);
    click(node, 'Nochmal versuchen');
    await settled();
    expect(store.confirm).toHaveBeenCalledTimes(1);
    expect(store.choose).not.toHaveBeenCalled();
  });

  it('catches a press whose work throws, and unlocks', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const store = stub({ kind: 'idle', folder: 'Haushalt' }, {
        forget: async () => { throw new Error('forget broke'); },
      });
      const node = render({ store, adopt: async () => 'pushed', changed: () => {}, say: () => {} });
      click(node, 'Ordner vergessen');
      await new Promise((done) => setTimeout(done, 10));
      flushSync();
      expect(unhandled).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'forget broke' }));
      expect([...node.querySelectorAll('button')].some((b) => b.disabled)).toBe(false);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

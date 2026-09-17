// @vitest-environment jsdom
/*
 * The sheet a product opens when the database it found was not one it can read.
 * conventions.md §6.7.
 *
 * Two products had written this - bildhaft and vorlaut-editor - and what is
 * asserted here is the three things bildhaft's shape has and the other did not,
 * because those are the reasons this is shared rather than copied a third time:
 * the count, the region, and a discard that can fail.
 *
 * The last one is a behaviour change and not a port. vorlaut closes the sheet
 * *before* discarding, so when the write refuses there is no region left to
 * report into and the boot has already restarted. Here the close happens after
 * the await, which is what the last two cases are about.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Rescue from '../svelte/Rescue.svelte';
import RescueFoot from '../svelte/RescueFoot.svelte';
import { Rescuing, type RescueJobs, type RescueWords } from '../svelte/rescuing.svelte.js';

const WORDS: RescueWords = {
  body: (from) => `Die Datenbank ist bei Version ${from} stehen geblieben.`,
  holds: (count) => `${count} Einträge warten darauf, gesichert zu werden.`,
  saved: 'Die Datei ist gesichert.',
  discarding: 'Wird gelöscht …',
  failed: (reason) => `Fehlgeschlagen: ${reason}`,
  download: 'Als Datei sichern',
  discard: (from) => `Version ${from} verwerfen`,
};

const nothing: RescueJobs = { save: () => {}, discard: () => {}, again: () => {} };

const live: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const app of live.splice(0)) void unmount(app);
  document.body.replaceChildren();
});

function render(component: unknown, s: Rescuing): HTMLElement {
  const target = document.createElement('div');
  document.body.append(target);
  live.push(mount(component as Parameters<typeof mount>[0], { target, props: { s } }));
  flushSync();
  return target;
}

const buttons = (node: HTMLElement) => [...node.querySelectorAll('button')];

describe('what the sheet says', () => {
  it('names the version and counts what is in the file', () => {
    /* The count is the one fact that could change a mind about whether the file
       is worth keeping, which is why bildhaft's shape is the standard. */
    const node = render(Rescue, new Rescuing(4, 312, WORDS, nothing));
    expect(node.textContent).toContain('Version 4');
    expect(node.textContent).toContain('312 Einträge');
  });

  it('holds its region from the first paint, empty', () => {
    /* showModal() makes the page behind it inert, so the toast reaches nobody
       while this is open - §3.8, "a modal earns a second region". A region that
       arrives carrying its message announces nothing. */
    const region = render(Rescue, new Rescuing(4, 1, WORDS, nothing))
      .querySelector('[role="status"]');
    expect(region).not.toBe(null);
    expect(region!.textContent).toBe('');
  });
});

describe('the file comes before anything is destroyed', () => {
  it('shuts the discard until the file has been taken', async () => {
    const s = new Rescuing(4, 1, WORDS, nothing);
    const [download, discard] = buttons(render(RescueFoot, s));
    expect(download!.disabled).toBe(false);
    expect(discard!.disabled).toBe(true);

    await s.save();
    flushSync();
    expect(discard!.disabled).toBe(false);
    expect(s.said).toBe(WORDS.saved);
  });

  it('leaves it shut where the download refused', async () => {
    const s = new Rescuing(4, 1, WORDS, {
      ...nothing,
      save: () => { throw new Error('kein Platz'); },
    });
    const [, discard] = buttons(render(RescueFoot, s));

    await s.save();
    flushSync();
    expect(s.saved).toBe(false);
    expect(discard!.disabled).toBe(true);
    expect(s.said).toBe('Fehlgeschlagen: kein Platz');
  });
});

describe('a discard that fails', () => {
  it('says so, and the sheet is still up to say it in', async () => {
    let closed = 0;
    let again = 0;
    const s = new Rescuing(4, 1, WORDS, {
      save: () => {},
      discard: async () => { throw new Error('die Datenbank ist gesperrt'); },
      again: () => { again += 1; },
    });
    s.close = () => { closed += 1; };
    s.saved = true;
    const [, discard] = buttons(render(RescueFoot, s));

    await s.discard();
    flushSync();
    expect(s.said).toBe('Fehlgeschlagen: die Datenbank ist gesperrt');
    // The whole of the reorder: neither of these happened.
    expect(closed).toBe(0);
    expect(again).toBe(0);
    // And both buttons are back, because the sheet still offers both.
    expect(s.going).toBe(false);
    expect(discard!.disabled).toBe(false);
  });

  it('is not a dismissal, and the flag that says so is not the in-flight one', () => {
    /* `discarded` is the host's `onClose` reader - "stopped" for a dismissal,
       nothing for a discard - and after a failure the person has *not* walked
       away. §6.7: the two flags are not one. */
    const s = new Rescuing(4, 1, WORDS, nothing);
    expect(s.discarded).toBe(false);
  });
});

describe('a discard that goes through', () => {
  it('closes the sheet after the await, and starts the page again', async () => {
    const order: string[] = [];
    const s = new Rescuing(4, 1, WORDS, {
      save: () => {},
      discard: async () => { order.push('discard'); },
      again: () => { order.push('again'); },
    });
    s.close = () => { order.push('close'); };
    s.saved = true;

    await s.discard();
    expect(order).toEqual(['discard', 'close', 'again']);
    expect(s.discarded).toBe(true);
  });

  it('says what it is doing while it does it, which vorlaut never could', async () => {
    let said = '';
    const s = new Rescuing(4, 1, WORDS, {
      save: () => {},
      discard: async () => { said = s.said; },
      again: () => {},
    });
    s.saved = true;

    await s.discard();
    expect(said).toBe(WORDS.discarding);
  });
});

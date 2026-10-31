// @vitest-environment jsdom
/*
 * What „Deine Daten" promises: one answer, at most one button, and every
 * other thing the old column offered still reachable through the `⋯`.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AblageStatus } from '../dist/ablage.js';
import type { Sicherung, Status } from '../dist/index.js';
import { headlineFor } from '../dist/daten-panel.js';
import DatenPanel from '../svelte/DatenPanel.svelte';

function stubStore(first: AblageStatus, extra: Record<string, unknown> = {}) {
  let status = first;
  return {
    app: 'bildhaft',
    get status() { return status; },
    subscribe(listener: (next: AblageStatus) => void) { listener(status); return () => {}; },
    choose: vi.fn(async () => status),
    confirm: vi.fn(async () => status),
    forget: vi.fn(async () => { status = { kind: 'off' }; return status; }),
    nest: async () => status,
    handle: (): object | null => null,
    folders: async () => [],
    adopted: async () => true,
    ...extra,
  };
}

function stubBackup(status: Status) {
  return {
    status,
    subscribe: () => () => {},
    choose: vi.fn(async () => status), confirm: vi.fn(async () => status),
    confirmEmpty: async () => status, save: async () => status, forget: vi.fn(async () => status),
  } as unknown as Sicherung & { choose: ReturnType<typeof vi.fn> };
}

const live: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const app of live.splice(0)) void unmount(app);
  document.body.replaceChildren();
});

function render(props: Record<string, unknown>): HTMLElement {
  const target = document.createElement('div');
  document.body.append(target);
  live.push(mount(DatenPanel, {
    target,
    props: { adopt: async () => 'pushed', changed: () => {}, say: () => {},
      file: { download: () => {}, read: () => {} }, ...props } as never,
  }));
  flushSync();
  return target;
}

const buttonsOutsideMenu = (node: HTMLElement) =>
  [...node.querySelectorAll<HTMLButtonElement>('.acts button')].map((b) => b.textContent);

function openMenu(node: HTMLElement): string[] {
  (node.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement).click();
  flushSync();
  return [...node.querySelectorAll('.menu button')].map((b) => b.firstChild?.textContent ?? '');
}

describe('DatenPanel', () => {
  it('draws no button while the folder is fine', () => {
    const node = render({ store: stubStore({ kind: 'idle', folder: 'Lautstark' }) });
    expect(node.querySelector('.where b')?.textContent).toBe('Alles liegt im Ordner „Lautstark“.');
    expect(buttonsOutsideMenu(node)).toEqual([]);
  });

  it.each([
    [{ kind: 'off' }, 'Ordner wählen …'],
    [{ kind: 'needs-permission', folder: 'L' }, 'Zugriff erlauben'],
    [{ kind: 'stale', folder: 'L', reason: 'weg' }, 'Nochmal versuchen'],
    [{ kind: 'unsupported' }, 'Sicherung herunterladen'],
  ] as [AblageStatus, string][])('has one button where something is to do: %o', (status, label) => {
    expect(buttonsOutsideMenu(render({ store: stubStore(status) }))).toEqual([label]);
  });

  it('keeps every old action in the menu, deleting last', () => {
    const node = render({ store: stubStore({ kind: 'idle', folder: 'L' }), wipe: () => {} });
    expect(openMenu(node)).toEqual([
      'Anderer Ordner …', 'Ordner vergessen',
      'Sicherung herunterladen', 'Sicherung einlesen …', 'Alles löschen …',
    ]);
    expect(node.querySelector('.menu button:last-child')?.className).toBe('danger');
  });

  it('offers the dated second copy only while the work is in the browser', () => {
    const backup = stubBackup({ kind: 'off' });
    const inBrowser = render({ store: stubStore({ kind: 'off' }), backup });
    expect(openMenu(inBrowser)).toContain('Automatisch sichern in …');
    const inFolder = render({ store: stubStore({ kind: 'idle', folder: 'L' }), backup });
    expect(openMenu(inFolder)).not.toContain('Automatisch sichern in …');
  });

  it('runs a row inside the click, so a picker is still allowed to open', () => {
    const download = vi.fn();
    const node = render({ store: stubStore({ kind: 'idle', folder: 'L' }), file: { download, read: () => {} } });
    openMenu(node);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const rows = [...node.querySelectorAll<HTMLButtonElement>('.menu button')];
    rows.find((b) => b.textContent?.startsWith('Sicherung einlesen'))!.click();
    expect(click).toHaveBeenCalledTimes(1);
    openMenu(node);
    [...node.querySelectorAll<HTMLButtonElement>('.menu button')]
      .find((b) => b.textContent?.startsWith('Sicherung herunterladen'))!.click();
    expect(download).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('walks with the arrows and gives focus back on Escape', () => {
    const node = render({ store: stubStore({ kind: 'idle', folder: 'L' }) });
    openMenu(node);
    const rows = [...node.querySelectorAll<HTMLButtonElement>('.menu button')];
    const menu = node.querySelector('.menu')!;
    rows[0].focus();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(node.querySelector('.menu')).toBe(null);
    expect(document.activeElement).toBe(node.querySelector('[aria-haspopup="menu"]'));
  });

  it('offers a follower neither another folder nor forgetting it', () => {
    const node = render({ store: stubStore({ kind: 'idle', folder: 'L' }, { follows: 'wochenwerk' }) });
    expect(openMenu(node)).toEqual(['Sicherung herunterladen', 'Sicherung einlesen …']);
  });

  it('tells the frame its headline', () => {
    const headline = vi.fn();
    render({ store: stubStore({ kind: 'idle', folder: 'Lautstark' }), headline });
    expect(headline).toHaveBeenLastCalledWith('im Ordner „Lautstark“');
    expect(headlineFor({ kind: 'off' })).toBe('nur in diesem Browser');
  });
});

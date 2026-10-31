<script lang="ts">
  /**
   * „Deine Daten" — where the work lives, whether that is safe, and every way
   * to move it, in one block. `src/daten-panel.ts` beside it has the words and
   * the reason this replaced `AblagePanel` + `BackupPanel` + a product's own
   * buttons + a separate „Alles löschen" panel.
   *
   * The shape, and nothing else is drawn:
   *
   *   the box     one sentence on where, one on what that means, a dot that
   *               says whether it is being kept, and the `⋯` in its corner
   *   one button  only when something is the household's to do
   *   „Warum?"    folded
   *
   * ## The menu is drawn here, not borrowed
   *
   * conventions.md §6.0: a provider package does not gain design as a runtime
   * dependency, so `@lautstark/design/svelte/Overflow` is not imported. What is
   * kept is its vocabulary — `.menu-anchor > .menu > button[role=menuitem]`,
   * `hr`, `.danger` — and its keyboard contract from components.css: opening
   * moves focus to the first row, the arrows and Home/End walk the rows,
   * Escape closes and hands focus back to the trigger.
   *
   * ## A row runs inside the click
   *
   * „Sicherung einlesen" opens a file picker and „Ordner wählen" a directory
   * picker, and both are refused without a user gesture. So a row closes the
   * menu and calls its job in the same click handler, before any await.
   *
   * ## What is kept from `AblagePanel`
   *
   * One press at a time (`working`), the handle check that tells a dismissed
   * picker from a pick, the one question asked in the panel when a folder is
   * empty, the follower's narrower offer, the consent switch. All of it for
   * the reasons that file gives; they are not repeated here.
   *
   * Everything comes from `../dist`, for `BackupPanel.svelte`'s reason.
   */
  import { tick } from 'svelte';
  import { announcedFolder, type Ablage, type AblageStatus } from '../dist/ablage.js';
  import { WORDS as WHERE } from '../dist/ablage-panel.js';
  import { WORDS as KEEP, sentenceFor } from '../dist/backup-panel.js';
  import { WORDS, headlineFor, unkept, type PanelLang } from '../dist/daten-panel.js';
  import type { Sicherung, Status } from '../dist/index.js';
  import { actionsFor, needsAttention } from '../dist/ui.js';

  let {
    store,
    adopt,
    changed,
    say,
    file,
    wipe,
    backup = null,
    headline,
    lang = 'de',
    home = 'Lautstark',
    siblings = ['bildhaft', 'wochenwerk', 'mitreden', 'vorlaut'],
    share,
    id,
  }: {
    store: Ablage;
    /** What the product does once a folder is settled on. */
    adopt: () => Promise<'pushed' | 'pulled' | 'incomplete'>;
    /** Everything on screen is about to be wrong. */
    changed: () => void;
    say: (line: string) => void;
    /** The product's own whole-backup file, out and in. `note` says what the
     *  file holds, where the generic sentence would be too vague. */
    file: {
      download: () => unknown;
      read: (picked: File) => unknown;
      note?: string;
      accept?: string;
    };
    /** Deleting everything. The product asks before it does it, as it did. */
    wipe?: () => unknown;
    /** The dated second copy. Offered only while the work is in the browser:
     *  with a folder as the store, the folder is the copy. */
    backup?: Sicherung | null;
    /** The words for the panel frame around this, beside „Deine Daten". */
    headline?: (text: string) => void;
    lang?: PanelLang;
    home?: string;
    siblings?: string[];
    share?: { reads: () => boolean; write: (on: boolean) => Promise<void> };
    id?: string;
  } = $props();

  let announced = $state.raw<AblageStatus | null>(null);
  const status = $derived(announced ?? store.status);
  $effect(() => {
    announced = null;
    return store.subscribe((next) => { announced = next; });
  });

  let kept = $state.raw<Status | null>(null);
  const keeping = $derived(backup ? kept ?? backup.status : null);
  $effect(() => {
    kept = null;
    return backup?.subscribe((next) => { kept = next; });
  });

  let asking = $state<string | null>(null);
  let working = $state(false);
  let consented = $state.raw<boolean | null>(null);
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let list = $state<HTMLDivElement>();
  let picker = $state<HTMLInputElement>();

  const words = $derived(WORDS[lang]);
  const where = $derived(WHERE[lang]);
  const supported = $derived(status.kind !== 'unsupported');
  const held = $derived(status.kind !== 'off' && status.kind !== 'unsupported');
  const stale = $derived(status.kind === 'stale' || status.kind === 'failed');
  const named = $derived('folder' in status ? status.folder : '');
  const other = $derived(held ? null : announcedFolder());
  const following = $derived(store.follows !== undefined);
  /* The second copy belongs to the browser-held store only, and only where
     the browser can write a folder at all. */
  const offersKeep = $derived(!held && keeping !== null && keeping.kind !== 'unsupported');

  $effect(() => headline?.(headlineFor(status, lang)));

  const title = $derived(
    status.kind === 'unsupported' ? words.plain
    : status.kind === 'off' ? words.browser
    : status.kind === 'needs-permission' ? words.permission(named)
    : stale ? words.unreachable(named)
    : words.folder(named),
  );
  const note = $derived(
    status.kind === 'unsupported' ? words.plainNote
    : status.kind === 'off' ? words.browserNote
    : status.kind === 'needs-permission' ? words.permissionNote
    : stale ? words.unreachableNote
    : words.folderNote,
  );

  function press(job: () => Promise<unknown>): () => void {
    return () => {
      if (working) return;
      working = true;
      void job()
        .catch((error: unknown) => { console.error(error); })
        .finally(() => { working = false; });
    };
  }

  async function settle(nest: boolean): Promise<void> {
    asking = null;
    if (nest) await store.nest(home);
    const went = await adopt();
    say(went === 'pushed' ? where.pushed : went === 'pulled' ? where.pulled : where.incomplete);
    changed();
  }

  async function choose(): Promise<void> {
    const before = store.handle();
    await store.choose();
    if (store.handle() === before) return;
    const now = store.status;
    if (now.kind === 'off' || now.kind === 'unsupported') return;
    const gathered = (await store.folders())
      .some((name) => siblings.includes(name.toLowerCase()));
    if (!(await store.adopted()) && !gathered) {
      asking = 'folder' in now ? now.folder : '';
      return;
    }
    await settle(false);
  }

  async function consent(on: boolean): Promise<void> {
    await share!.write(on);
    consented = share!.reads();
  }

  /** The one button under the box, where there is one. */
  const primary = $derived.by((): { label: string; run: () => void } | null => {
    switch (status.kind) {
      case 'unsupported': return { label: words.download, run: () => void file.download() };
      case 'off': return following ? null : { label: words.pick, run: press(choose) };
      case 'needs-permission': return { label: words.allow, run: press(() => store.confirm()) };
      case 'stale':
      case 'failed':
        return { label: words.retry, run: press(following ? () => store.confirm() : choose) };
      default: return null;
    }
  });

  /* The second copy's own state, under the box, while it has a folder. Its
     button only where it needs somebody — the rest of its actions are rows. */
  const keepLine = $derived(offersKeep && keeping && keeping.kind !== 'off' ? keeping : null);
  const keepAction = $derived(
    keepLine && backup && needsAttention(keepLine)
      ? actionsFor(backup, keepLine).find((action) => action.primary) ?? null
      : null,
  );

  type Row = { label: string; note?: string; danger?: boolean; run: () => void } | 'rule';

  function rows(): Row[] {
    const out: Row[] = [];
    if (supported && !following) {
      if (held) {
        out.push({ label: words.another, note: words.anotherNote, run: press(choose) });
        out.push({
          label: words.forget, note: words.forgetNote,
          run: press(async () => { await store.forget(); changed(); }),
        });
      } else if (primary === null) {
        out.push({ label: words.pick, run: press(choose) });
      }
    }
    if (offersKeep && backup) {
      const copy = backup;
      out.push(keeping!.kind === 'off'
        ? { label: words.keep, note: words.keepNote, run: press(() => copy.choose()) }
        : { label: words.keepForget, run: press(async () => { await copy.forget(); say(KEEP[lang].forgotten); }) });
    }
    if (out.length) out.push('rule');
    if (status.kind !== 'unsupported') {
      out.push({ label: words.download, note: file.note ?? words.downloadNote, run: () => void file.download() });
    }
    out.push({ label: words.read, note: words.readNote, run: () => picker?.click() });
    if (wipe) out.push('rule', { label: words.wipe, danger: true, run: () => void wipe() });
    return out;
  }

  const items = (): HTMLButtonElement[] =>
    [...(list?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];

  async function toggle(): Promise<void> {
    open = !open;
    if (!open) return;
    await tick();
    fit();
    items()[0]?.focus({ preventScroll: true });
  }

  /* Opens upward where there is more room above, and caps the height so the
     list stays inside the sheet's scrolling body. The same arithmetic as
     @lautstark/design/svelte/fit.js, which §6.0 keeps this from importing; the
     class it toggles, `.menu-anchor--up`, is drawn by components.css. */
  let up = $state(false);
  let cap = $state<number | null>(null);
  function fit(): void {
    if (!list || !trigger) return;
    /* The nearest box that scrolls, not `.closest('.body')`: inside a settings
       sheet the first `.body` up is the Panel's own, which is as tall as this
       block and would leave no room either way. */
    let box: HTMLElement | null = trigger.parentElement;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const view = box ? box.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const at = trigger.getBoundingClientRect();
    const below = view.bottom - at.bottom - 12;
    const above = at.top - view.top - 12;
    up = list.offsetHeight > below && above > below;
    cap = Math.max(96, Math.floor(up ? above : below));
  }

  function close(refocus: boolean): void {
    open = false;
    up = false;
    cap = null;
    if (refocus) trigger?.focus();
  }

  function walk(event: KeyboardEvent): void {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (to: number) => { event.preventDefault(); all[(to + all.length) % all.length]?.focus(); };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(all.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(false);
  }

  /* A press anywhere else closes it, as every other menu in the family does. */
  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list?.contains(target) && !trigger?.contains(target)) close(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  });
</script>

<div {id} class="where-panel">
  {#if asking}
    <p class="small">{where.empty(asking)}</p>
    <pre class="tree">{asking}
└── {home}</pre>
    <div class="acts">
      <button type="button" class="btn sm primary" disabled={working}
        onclick={press(() => settle(true))}>{where.make(home)}</button>
      <button type="button" class="btn sm quiet" disabled={working}
        onclick={press(() => settle(false))}>{where.direct(asking)}</button>
    </div>
  {:else}
    <div class="where{unkept(status) ? ' bad' : ''}" data-state={status.kind}>
      <b><span class="dot"></span>{title}</b>
      <span class="menu-anchor{up ? ' menu-anchor--up' : ''}">
        <button bind:this={trigger} type="button" class="btn quiet icon" aria-label={words.more}
          title={words.more} aria-haspopup="menu" aria-expanded={open}
          onclick={() => void toggle()}>⋯</button>
        {#if open}
          <div bind:this={list} class="menu" role="menu" tabindex="-1" onkeydown={walk}
            style:max-height={cap === null ? undefined : `${cap}px`} style:overflow-y="auto"
            style:overscroll-behavior="contain">
            {#each rows() as row, at (at)}
              {#if row === 'rule'}<hr />{:else}<button type="button" role="menuitem"
                class={row.danger ? 'danger' : undefined} disabled={working}
                onclick={() => { close(false); row.run(); }}>{row.label}{#if row.note}<span
                  class="menu__note">{row.note}</span>{/if}</button>{/if}
            {/each}
          </div>
        {/if}
      </span>
      <span class="small faint">{note}</span>
    </div>
    {#if status.kind === 'conflicted'}
      <p class="notice bad">{where.twice(status.ids.length)}</p>
    {/if}
    {#if status.kind === 'off' && other}
      <p class="small muted">{where.elsewhere(other.app, other.folder)}</p>
    {/if}
    {#if held && share}
      <div class="where-share">
        <label class="check">
          <input type="checkbox" checked={consented ?? share.reads()}
            onchange={(event) => void consent(event.currentTarget.checked)} /><span
            >{where.share}</span>
        </label>
        <p class="small muted">{where.shareNote}</p>
      </div>
    {/if}
    {#if keepLine}
      <p class={needsAttention(keepLine) ? 'standing notice bad' : 'standing'}
        data-state={keepLine.kind}><span class="dot"></span><span
        >{sentenceFor(keepLine, lang)}</span></p>
    {/if}
    {#if primary || keepAction}
      <div class="acts">
        {#if primary}<button type="button" class="btn sm primary" disabled={working}
          onclick={primary.run}>{primary.label}</button>{/if}
        {#if keepAction}<button type="button" class="btn sm" disabled={working}
          onclick={press(() => keepAction.run())}>{KEEP[lang][keepAction.id]}</button>{/if}
      </div>
    {/if}
    <details class="where-why">
      <summary>{words.why}</summary>
      <ul>{#each words.reasons as reason (reason)}<li>{reason}</li>{/each}</ul>
    </details>
  {/if}
  <input bind:this={picker} type="file" hidden accept={file.accept ?? 'application/json,.json'}
    onchange={() => {
      const picked = picker?.files?.[0];
      if (picker) picker.value = '';
      if (picked) void file.read(picked);
    }} />
</div>

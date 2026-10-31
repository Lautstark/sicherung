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
   * ## The menu is werkzeuge's
   *
   * conventions.md §6.0: a provider package does not gain design as a runtime
   * dependency, so `@lautstark/design/svelte/Overflow` is not imported. This
   * file drew the menu itself until bildquelle's and stimmquelle's panels
   * needed the same one; it is `@lautstark/werkzeuge/svelte/MoreMenu` now,
   * with the vocabulary, the keyboard contract and the upward fit this file
   * had. A row runs inside the click, which is what lets „Sicherung einlesen"
   * open a file picker and „Ordner wählen" a directory picker.
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
  import MoreMenu, { type MenuRow } from '@lautstark/werkzeuge/svelte/MoreMenu';
  import { announcedFolder, type Ablage, type AblageStatus } from '../dist/ablage.js';
  import { WORDS as WHERE } from '../dist/ablage-panel.js';
  import { WORDS as KEEP, sentenceFor } from '../dist/backup-panel.js';
  import { WORDS, headlineFor, unkept, type PanelLang } from '../dist/daten-panel.js';
  import type { Sicherung, Status } from '../dist/index.js';
  import { actionsFor, ago, needsAttention } from '../dist/ui.js';

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
    /** The dated copies. They go into the store's folder — `useFolder` with
     *  its handle when one is settled on, `forget` when it is let go — so
     *  there is one folder to choose, never two. */
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
  let picker = $state<HTMLInputElement>();

  const words = $derived(WORDS[lang]);
  const where = $derived(WHERE[lang]);
  const supported = $derived(status.kind !== 'unsupported');
  const held = $derived(status.kind !== 'off' && status.kind !== 'unsupported');
  const stale = $derived(status.kind === 'stale' || status.kind === 'failed');
  const named = $derived('folder' in status ? status.folder : '');
  const other = $derived(held ? null : announcedFolder());
  const following = $derived(store.follows !== undefined);
  /* The dated copies go into the store's own folder — one folder, never a
     second one to choose. Before 2026-10-31 a household could pick a separate
     folder for them; one that did, and has no store folder, still sees it here
     with a row to stop it, and is offered nothing new. */
  const legacyKeep = $derived(!held && keeping !== null && keeping.kind !== 'off' && keeping.kind !== 'unsupported');

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
    /* The dated copies follow the work into its folder now, not on the next
       start. The products did this only at boot, so a folder chosen during a
       visit had no copies until a reload. */
    const root = store.handle();
    if (backup && root) await backup.useFolder(root).catch(() => undefined);
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

  /* The copies' own state, under the box. A button only where they need
     somebody; stopping a separate folder from before is a row. */
  const keepLine = $derived(
    keeping && keeping.kind !== 'off' && keeping.kind !== 'unsupported' && (held || legacyKeep)
      ? keeping : null,
  );
  const keepAction = $derived(
    keepLine && backup && needsAttention(keepLine)
      ? actionsFor(backup, keepLine).find((action) => action.primary) ?? null
      : null,
  );
  /* Beside the store the folder is already named in the box, so the line
     only says how old the newest copy is. A separate folder (`legacyKeep`)
     and anything needing attention keep the package's full sentence. */
  const keepSays = $derived.by(() => {
    if (!keepLine) return '';
    if (!held || needsAttention(keepLine)) return sentenceFor(keepLine, lang);
    if (keepLine.kind === 'saving') return words.copiesSaving;
    return 'lastWrite' in keepLine && keepLine.lastWrite !== null
      ? words.copies(ago(keepLine.lastWrite, lang)) : words.copiesNone;
  });

  function rows(): MenuRow[] {
    const out: MenuRow[] = [];
    if (supported && !following) {
      if (held) {
        out.push({ label: words.another, note: words.anotherNote, run: press(choose) });
        out.push({
          label: words.forget, note: words.forgetNote,
          run: press(async () => { await store.forget(); await backup?.forget(); changed(); }),
        });
      } else if (primary === null) {
        out.push({ label: words.pick, run: press(choose) });
      }
    }
    if (legacyKeep && backup) {
      const copy = backup;
      out.push({ label: words.keepForget, run: press(async () => { await copy.forget(); say(KEEP[lang].forgotten); }) });
    }
    if (out.length) out.push('rule');
    if (status.kind !== 'unsupported') {
      out.push({ label: words.download, note: file.note ?? words.downloadNote, run: () => void file.download() });
    }
    out.push({ label: words.read, note: words.readNote, run: () => picker?.click() });
    if (wipe) out.push('rule', { label: words.wipe, danger: true, run: () => void wipe() });
    return out;
  }

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
      <MoreMenu label={words.more} rows={rows} disabled={working} />
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
        >{keepSays}</span></p>
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

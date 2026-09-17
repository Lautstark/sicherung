<script lang="ts">
  /**
   * The panel that answers where a household's work lives, for a product
   * written in Svelte. conventions.md §6.8; the twin of `src/ablage-panel.ts`,
   * beside it.
   *
   * Same words — `WORDS` is imported from the vanilla module, not copied — the
   * same rows in the same order, and the same two questions it is allowed to
   * ask. What follows is every place it is deliberately not the same.
   *
   * ## It gains a teardown, and that is the point of the port
   *
   * The vanilla panel subscribes to nothing and has no `dispose`: it is a node
   * a page builds once and keeps, and its `refresh` is called by the product
   * when something moved. A component is a different proposition — it can be
   * unmounted while a folder is being adopted, which is the one job here that
   * takes seconds rather than milliseconds — so this one holds the status
   * through `Ablage.subscribe` and the `$effect` returns the unsubscribe.
   * §6.8: "in Svelte the subscription is an `$effect` returning its teardown".
   *
   * A job already in flight still settles; what the teardown stops is the
   * listener outliving the component and painting into a tree nobody can see,
   * which is the defect `backup-panel.ts` records three products having.
   *
   * ## `working` is a `disabled`, not a walk over the DOM
   *
   * The vanilla panel shuts its buttons by querying `.acts button` and setting
   * `disabled`, twice — once at the press, because a second press arrives long
   * before any await resolves, and once after a redraw, because a redraw hands
   * back a fresh and perfectly pressable button. Both calls are the same
   * missing thing: a button whose work is under way and which still looks
   * pressable is a lie about what is happening. Here it is one `disabled`
   * binding on every button this panel draws, and the redraw cannot lose it.
   *
   * The vanilla's care not to reach into `below`'s nodes carries over by
   * construction: `below` is a snippet the product renders and this component
   * never touches it.
   *
   * ## `below` is a snippet
   *
   * The vanilla option is `() => (Node | null)[]`, which is what a product with
   * its own hand-built export button has. A Svelte product has components, and
   * the package may not import design's `Vanilla` to wrap a stray node — §6.0
   * keeps the dependency pointing the other way. So the option keeps its name
   * and its place at the foot of the panel and changes shape.
   *
   * ## Everything below comes from `../dist`, and must
   *
   * The same rule as `BackupPanel.svelte`, whose header carries the whole of
   * it: a component imports what a consumer imports, because the `Ablage` a
   * product holds is the built class and `tsc` brands it `#private;`. One
   * addition here — `AblageStatus` came from `../src/types.js`, which is not a
   * published entry at all; `./ablage` re-exports it and that is where a
   * consumer gets it.
   */
  import type { Snippet } from 'svelte';
  import { announcedFolder, type Ablage, type AblageStatus } from '../dist/ablage.js';
  import { WORDS, type PanelLang } from '../dist/ablage-panel.js';

  let {
    store,
    adopt,
    changed,
    say,
    lang = 'de',
    home = 'Lautstark',
    siblings = ['bildhaft', 'wochenwerk', 'mitreden', 'vorlaut'],
    share,
    below,
    id,
  }: {
    store: Ablage;
    /** What the product does once a folder is settled on. */
    adopt: () => Promise<'pushed' | 'pulled' | 'incomplete'>;
    /** Everything on screen is about to be wrong. */
    changed: () => void;
    say: (line: string) => void;
    /** The page's language. A change repaints — §6.8. */
    lang?: PanelLang;
    /** The name every Lautstark programme files under. */
    home?: string;
    /** Folder names that mean "this already gathers our work". */
    siblings?: string[];
    /**
     * The consent switch, where the product keeps a preference for it. Absent
     * means the product does not offer it, and no switch is drawn.
     */
    share?: { reads: () => boolean; write: (on: boolean) => Promise<void> };
    /** What the product offers besides the store: its own snapshot, its own
     *  file. A snippet; see above. */
    below?: Snippet;
    /** On the block itself. Every shared component takes one — §6.0. */
    id?: string;
  } = $props();

  /* `Ablage.subscribe` tells its listener on subscribe, so this is null only
     between construction and the first paint. Reading `store.status` in the
     derived covers that gap and keeps the panel answering about the store it
     is holding now. */
  let announced = $state.raw<AblageStatus | null>(null);
  const status = $derived(announced ?? store.status);
  $effect(() => {
    announced = null;
    return store.subscribe((next) => { announced = next; });
  });

  /* The name of a folder somebody just picked that holds nothing of ours yet.
     It lives across renders because the question is asked in the panel rather
     than in a dialog over it: a dialog on top of a dialog is what this panel
     was rebuilt to stop doing. */
  let asking = $state<string | null>(null);

  /* One press at a time. Every button here starts something that takes a while,
     and in between, the buttons that started it are still on screen. A
     household pressed „Ordner ‚Lautstark' anlegen" on 2026-09-14, saw nothing
     move, and pressed it again: the first press had nested and was writing the
     store, the second nested into the folder the first had just made, and what
     was left in the shallower one was half a store with no mark on it. The next
     device to reach that folder reads unmarked as unclaimed. */
  let working = $state(false);

  /* What the product's own preference answers, once it has been written. Null
     until then, so the switch draws what `reads()` says without this component
     capturing that answer at construction. */
  let consented = $state.raw<boolean | null>(null);

  const words = $derived(WORDS[lang]);
  const held = $derived(status.kind !== 'off' && status.kind !== 'unsupported');
  const stale = $derived(status.kind === 'stale' || status.kind === 'failed');
  const named = $derived('folder' in status ? status.folder : '');
  /* Another programme on this device saying where its folder is. Read again
     whenever the state changes, as the vanilla panel reads it on every draw:
     it is a cookie, and nothing here is told when one is written. */
  const other = $derived(held ? null : announcedFolder());
  const sibling = $derived(siblings.find((name) => name !== store.app) ?? 'wochenwerk');

  function press(job: () => Promise<unknown>): () => void {
    return () => {
      if (working) return;
      working = true;
      void job().finally(() => { working = false; });
    };
  }

  async function settle(nest: boolean): Promise<void> {
    asking = null;
    if (nest) await store.nest(home);
    const went = await adopt();
    say(went === 'pushed' ? words.pushed : went === 'pulled' ? words.pulled : words.incomplete);
    changed();
  }

  async function choose(): Promise<void> {
    await store.choose();
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
    // What the product's preference says now, which is not necessarily what was
    // just asked of it.
    consented = share!.reads();
  }
</script>

<div {id} class="where-panel">
  {#if asking}
    <!-- Asked once, and only where the answer is genuinely open. -->
    <p class="small">{words.empty(asking)}</p>
    <pre class="tree">{asking}
└── {home}</pre>
    <div class="acts">
      <button type="button" class="btn sm primary" disabled={working}
        onclick={press(() => settle(true))}>{words.make(home)}</button>
      <button type="button" class="btn sm quiet" disabled={working}
        onclick={press(() => settle(false))}>{words.direct(asking)}</button>
    </div>
  {:else if !held}
    <!--
      The picture before the decision: one folder, a compartment per programme.
      Five lines answer what three paragraphs do not — and this programme's own
      compartment comes first, because a picture of somebody else's two folders
      explains the idea and not their situation.
    -->
    <p class="small">{words.intro}</p>
    <pre class="tree">{home}
├── {store.app}/
└── {sibling}/</pre>
    <div class="where">
      <b>{words.browser}</b><span class="small faint">{words.browserNote}</span>
    </div>
    <!--
      Two sentences in one paragraph rather than two stacked lines: the panel
      had grown a column of short muted paragraphs, which reads as a wall
      however short each one is.
    -->
    <p class="small muted">{words.offer} {words.noneYet}</p>
    <p class="small muted">{other ? words.elsewhere(other.app, other.folder) : words.same}</p>
    <div class="acts">
      <button type="button" class="btn sm" disabled={working}
        onclick={press(choose)}>{words.pick}</button>
    </div>
  {:else}
    <div class="where{stale ? ' bad' : ''}">
      <b>{stale ? words.unreachable : words.folder(named)}</b><span class="small faint"
        >{stale ? words.unreachableNote : words.folderNote}</span>
    </div>
    {#if status.kind === 'conflicted'}
      <p class="notice bad">{words.twice(status.ids.length)}</p>
    {/if}
    {#if share}
      <!--
        Consent, where a reader knows what it means: beside the folder they just
        chose, off until they say so, and off again in the same place. What it
        stores is said outright — nobody can agree to what they were not told.
      -->
      <div class="where-share">
        <label class="check">
          <input type="checkbox" checked={consented ?? share.reads()}
            onchange={(event) => void consent(event.currentTarget.checked)} /><span
            >{words.share}</span>
        </label>
        <p class="small muted">{words.shareNote}</p>
      </div>
    {/if}
    <div class="acts">
      {#if stale}
        <button type="button" class="btn sm primary" disabled={working}
          onclick={press(choose)}>{words.retry}</button>
      {/if}
      {#if status.kind === 'needs-permission'}
        <button type="button" class="btn sm primary" disabled={working}
          onclick={press(() => store.confirm())}>{words.allow}</button>
      {/if}
      <button type="button" class="btn sm quiet" disabled={working}
        onclick={press(choose)}>{words.another}</button>
      <button type="button" class="btn sm destructive" disabled={working}
        onclick={press(() => store.forget())}>{words.forget}</button>
    </div>
  {/if}
  <!-- The product's own extras, at the foot — but not under the one question
       this panel asks for itself: the vanilla panel returns before appending
       them there, so that a folder somebody has just picked is answered before
       anything else is offered. -->
  {#if !asking}{@render below?.()}{/if}
</div>

<script lang="ts">
  /**
   * The panel that says where the aging copy goes, for a product written in
   * Svelte. conventions.md §6.8; the twin of `src/backup-panel.ts`, beside it.
   *
   * Same options, same emitted markup, same `WORDS` — the table is imported
   * from the vanilla module rather than copied, because a second table in the
   * same package is the drift that module exists to have ended, with a shorter
   * walk between the two copies and nothing comparing them.
   *
   * ## What is not the same, and why
   *
   * **`lang` is a prop.** The vanilla panel takes `PanelLang | (() => PanelLang)`
   * and reads the thunk on every paint, because mitreden changes language
   * without reloading and a locale resolved once goes on answering in the
   * language the reader has just left. A thunk is what a vanilla module has
   * instead of reactivity; here the framework has it, so the prop is the value
   * and a change to it repaints. §6.8.
   *
   * **There is no `refresh` and no `dispose`.** Both exist over there for the
   * same reason the thunk does. The subscription is an `$effect` returning its
   * teardown, which is the unsubscribe the vanilla panel hands back and which
   * three of the four products it replaced never called.
   *
   * **Nothing is rendered where the browser has no picker.** The vanilla
   * function answers `null` there rather than an empty node, so that a tablet
   * is not shown a backup story it cannot have — `showDirectoryPicker` is
   * absent from Safari, from Firefox and from every browser on Android, and the
   * ordinary download button beside this is the whole offer there. A component
   * cannot answer null, so it draws nothing; and it asks the *live* status
   * rather than the one it started with, which is the same answer for a
   * `Sicherung` (an unsupported browser has no other status to be in) and a
   * cheaper one to reason about than a decision taken once at mount.
   */
  import { WORDS, headlineFor, sentenceFor, type PanelLang } from '../src/backup-panel.js';
  import type { Sicherung, Status } from '../src/index.js';
  import { actionsFor, needsAttention, type Action } from '../src/ui.js';

  let {
    backup,
    say,
    lang = 'de',
    headline,
    id,
  }: {
    backup: Sicherung;
    /** Something to say out loud. Only `forget` says anything. */
    say: (line: string) => void;
    /** The page's language. A change repaints; see above. */
    lang?: PanelLang;
    /**
     * Told the heading line on every repaint, so the panel's own summary
     * carries the folder without being unfolded. Blank where there is nothing
     * to say. Optional, because a product may have no heading to put it in.
     */
    headline?: (text: string) => void;
    /** On the block itself. Every shared component takes one — §6.0. */
    id?: string;
  } = $props();

  /* Who repaints, §6.8: the panel subscribes itself, and in Svelte the
     subscription is an `$effect` returning its teardown — which is the
     unsubscribe, called when this component goes.

     A status is replaced whole and never mutated, so `$state.raw`. It starts
     null rather than at `backup.status`, because `Sicherung.subscribe` does not
     call its listener on subscribe and the panel therefore has to read the
     status it arrived at: reading it *inside* the derived is that read, and it
     keeps the panel answering about whichever `Sicherung` it is holding now
     rather than about the one it was first given. */
  let announced = $state.raw<Status | null>(null);
  const status = $derived(announced ?? backup.status);
  $effect(() => {
    announced = null;
    return backup.subscribe((next) => { announced = next; });
  });

  /* The one press at a time, per button. `choose()` and `confirm()` open a
     browser prompt and are refused without a gesture, so these are buttons;
     shut while the write is in flight, so a second press cannot start a
     second. */
  let busy = $state<Action['id'] | null>(null);

  const words = $derived(WORDS[lang]);
  const actions = $derived(actionsFor(backup, status));

  /* Whether a state is somebody's to act on is this package's answer, the same
     as the buttons below. Every product drew `needs-permission` in the same
     grey as „gesichert vor 3 Minuten" until each was told separately.
     conventions.md §3.7. */
  const line = $derived(needsAttention(status) ? 'standing notice bad' : 'standing');

  $effect(() => headline?.(headlineFor(status, lang)));

  async function press(action: Action): Promise<void> {
    busy = action.id;
    try {
      await action.run();
      // The only one that says anything: the rest are reported by the status
      // line repainting underneath.
      if (action.id === 'forget') say(words.forgotten);
    } finally {
      busy = null;
    }
  }
</script>

{#if status.kind !== 'unsupported'}
  <!--
    `data-state` takes the kind verbatim. @lautstark/design styles these kinds
    by name, so a mapping here would be a fifth chance to disagree with the
    stylesheet about what `failed` looks like, and would hide a kind nobody has
    drawn yet behind one somebody has. §6.8.
  -->
  <div {id} class="backup-panel">
    <p class="small muted">{words.note}</p>
    <p class={line} data-state={status.kind}><span class="dot"></span><span
      >{sentenceFor(status, lang)}</span
    ></p>
    <div class="acts">
      {#each actions as action (action.id)}
        <button
          type="button"
          class="btn {action.primary ? 'primary' : 'quiet'} sm"
          disabled={busy === action.id}
          onclick={() => void press(action)}>{words[action.id]}</button
        >
      {/each}
    </div>
  </div>
{/if}

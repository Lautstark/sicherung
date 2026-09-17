<script lang="ts">
  /**
   * The two buttons. conventions.md §6.7.
   *
   * **Disabled until the file has been taken, and that is the whole enforcement
   * of "handed their data before anything is destroyed".**
   *
   * A second `<dialog>` asking "are you sure" was the other way to do it, and it
   * would be `showModal()` on top of `showModal()`. A button that cannot be
   * pressed until the file has been taken says the same thing earlier, and it
   * names the act rather than asking about it — §1.7.
   *
   * Both are shut while a job is running, which in bildhaft is what `going` is
   * for. After a discard that *failed*, `going` is false again and both come
   * back: the sheet is still up, because this component's whole difference from
   * vorlaut's is that the close happens after the discard rather than before it.
   */
  import type { Rescuing } from './rescuing.svelte.js';

  let { s }: { s: Rescuing } = $props();
</script>

<button class="btn primary" type="button" disabled={s.going}
  onclick={() => void s.save()}>{s.words.download}</button><button
  class="btn destructive" type="button" disabled={!s.saved || s.going}
  onclick={() => void s.discard()}>{s.words.discard(s.from)}</button>

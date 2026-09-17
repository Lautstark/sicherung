<script lang="ts">
  /**
   * The three lines of the rescue sheet. conventions.md §6.7.
   *
   * **The count line is the second one**, and it is why bildhaft's shape is the
   * standard: the number of records is the one fact that could change somebody's
   * mind about whether the file is worth keeping.
   *
   * **The third is the sheet's own live region.** `showModal()` makes the page
   * behind it inert, so the toast is not somewhere anybody can be told anything
   * while this is open — conventions.md §3.8, "a modal earns a second region".
   * In the tree from the first paint and empty, because a region that arrives
   * carrying its message announces nothing.
   *
   * Both products draw these two on `.hint`, which is a class of their own:
   * vorlaut's carries 16px of padding and an `:empty` guard for exactly the
   * paint above, and components.css draws no `.hint` at all. So the shared
   * version emits `small muted`, which components.css has drawn since 1.32 and
   * which needs no `:empty` guard because it sets no padding to guard.
   */
  import type { Rescuing } from './rescuing.svelte.js';

  let { s }: { s: Rescuing } = $props();
</script>

<p>{s.words.body(s.from)}</p><p class="small muted">{s.words.holds(s.held)}</p><p
  class="small muted" role="status">{s.said}</p>

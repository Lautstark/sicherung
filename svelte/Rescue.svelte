<script lang="ts">
  /**
   * The rescue sheet's contents, in one component. conventions.md §6.7.
   *
   * Both products put this in a sheet whose opener takes a `body` and a `foot`
   * as two separate components — bildhaft's `openSheet`, vorlaut's `openParts`,
   * and design's `./svelte/sheet` after them — because the frame draws `.head`,
   * `.body` and `.foot` and puts each where it belongs. Those hosts pass
   * `RescueBody` and `RescueFoot` and never touch this file.
   *
   * This is for the other host: one that has a region and wants the whole thing
   * in it. The buttons come wrapped in the `.acts` row the two panels in this
   * package already use, which components.css draws, rather than in a `.foot`,
   * which is the frame's and not this component's to emit.
   *
   * The package never imports the frame either way. A provider package does not
   * gain design as a runtime dependency — §6.0 — so the host supplies the sheet
   * and passes this in as content.
   */
  import RescueBody from './RescueBody.svelte';
  import RescueFoot from './RescueFoot.svelte';
  import type { Rescuing } from './rescuing.svelte.js';

  let { s }: { s: Rescuing } = $props();
</script>

<RescueBody {s} /><div class="acts"><RescueFoot {s} /></div>

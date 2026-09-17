import { svelte } from '@sveltejs/vite-plugin-svelte';
import { configDefaults, defineConfig } from 'vitest/config';

/*
 * Two suites in one run, and the differences between them are deliberate.
 *
 * **The environment stays `node`.** Everything in `src/` is storage and
 * arithmetic — `fake-indexeddb` in `test/setup.ts`, no document — and a DOM for
 * all of it would be a DOM nothing asks for. The one file that needs one says
 * so at the top of itself with `// @vitest-environment jsdom`, which is how
 * `test/css-contract.test.ts` has already been running since it was written,
 * and mounting Svelte components changes nothing about that: jsdom is here
 * anyway for the vanilla panels, and nothing in this package calls
 * `showModal()` — the sheet around `Rescue` belongs to the product. So no
 * happy-dom, and no flip of the default.
 *
 * **`resolve: { conditions: ['browser'] }` is not optional and was measured.**
 * Without it vitest resolves svelte's `server` export, `mount()` throws
 * `lifecycle_function_unavailable`, every test in the file fails at once, and
 * the message says nothing about configuration. conventions.md §6.0.
 *
 * **The full `svelte()` plugin**, rather than mitreden's twelve-line
 * `compileModule` shim: that one is the right size where nothing mounts a
 * component, and `test/css-contract.test.ts` mounts four.
 */
export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    // `.claude/worktrees/` holds full checkouts of this repo, each with its own
    // `test/`. Without this, a local `npm test` collects every copy and runs the
    // suite once per worktree — including against whatever half-finished state a
    // branch happens to be in. CI never saw it, because a fresh checkout has no
    // worktrees in it. bildquelle and stimmquelle both carry this line; this
    // repository was the one of the three without it.
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '.claude/**'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});

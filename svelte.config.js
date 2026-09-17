/*
 * Empty on purpose, and present on purpose.
 *
 * The components in `svelte/` are plain Svelte 5 with `lang="ts"`, which the
 * compiler strips itself — there is no preprocessor to configure and nothing
 * here is built. What the file buys is that vite-plugin-svelte and svelte-check
 * stop guessing: without it the plugin prints "no Svelte config found … using
 * default configuration" on every run, which is a line somebody eventually goes
 * looking for a cause behind. design carries the same file for the same reason.
 */
export default {};

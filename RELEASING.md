# Releasing

**Since 2026-09-16 this package is published to npmjs.org as
`@lautstark/sicherung`, prebuilt, by CI, from the commit subjects.** Nobody
runs `npm version` any more and nobody writes a tag. `dist/` is in the tarball
and there is no `prepare` script: a consumer installs compiled output and
compiles nothing.

The `github:Lautstark/sicherung#vX.Y.Z` pins still resolve for every tag cut
before that date. No tag cut after it carries a build step, so a consumer that
wants anything newer than v1.16.1 takes it from npm:

```
npm install @lautstark/sicherung@^1.17.0
```

A **git tag is still the release**, and it is still the thing that must never
move. What changed is who cuts it.

## What happens on a push to main

`.github/workflows/release.yml` calls the family's reusable workflow in
`Lautstark/.github`, which:

1. runs the gate — `npm run typecheck && npm test && npm run build`;
2. checks that the tarball `npm pack` would ship carries every entry point
   `package.json` declares, and no `prepare` script;
3. runs `semantic-release`, configured in `release.config.mjs`.

semantic-release reads every commit since the last `v*` tag and decides:

| subjects since the last tag contain | bump | example |
|---|---|---|
| `feat!:`, or a `BREAKING CHANGE:` trailer | **major** | a new `Status` kind, a new inlet beside `produce` |
| `feat:` | **minor** | a new export, a new optional option |
| `fix:`, `perf:` | **patch** | a fix with no API change |
| only `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:` | none | the run is green and nothing is published |

If there is a bump, it writes the version into `package.json` and the
lockfile's mirror of it, prepends the notes to `CHANGELOG.md`, commits the
three as `chore(release): x.y.z`, tags that commit `vx.y.z`, publishes the
tarball to npmjs.org with provenance, and writes a GitHub release with the
same notes. Then it checks that the tag on the commit, `package.json` and what
the registry answers for that version are one number — the check the old
tag-triggered CI made, asked of the commit it just tagged.

**So the bump is decided when the commit is written, not when the release is
cut.** The commit subject is the release note and the version at once, which
is why `commit-messages.yml` refuses a subject without a prefix: a commit that
says nothing about itself would ship silently under the next `fix:`.

## Which prefix

The rules from before still hold; only the spelling changed.

- **`fix:`** — a fix with no API change.
- **`feat:`** — new exports, new optional options.
- **`feat!:`** — anything a consumer must change code for: a removed export, a
  new `Status` kind they must draw, a changed return shape. Put the reason in a
  `BREAKING CHANGE:` trailer in the body; it becomes the first paragraph of the
  release note.

**A new `Status` kind is a major.** A product renders the status as a closed
set, and a kind it has never heard of renders as nothing at all — which in this
package means a backup that looks absent while it is fine, or fine while it is
absent. Both are the failure this whole thing exists to prevent.

A change to what may enter through `produce` — or a new inlet beside it — is
also always major, whatever the diff size. See the allow-list test in
`test/sicherung.test.ts`; consumers inherit the licensing behaviour described
in the README without inheriting the README.

Consumers take this package as a caret range now, and Renovate merges a minor
or a patch into them on its own once their tests pass. A major waits for a
person. That is the whole reason the prefix has to be honest: the number is a
resolver input again, and `feat:` on a change that breaks a consumer reaches
that consumer's main without anybody reading it.

## What a person still does, once

The workflow stops before semantic-release, green, with a notice, until the
npm side exists. That side is an account and cannot be created from a
repository:

1. The `lautstark` organisation on npmjs.org, which owns the `@lautstark`
   scope. Free for public packages.
2. A way for CI to publish. One of two:
   - **A token**: a granular automation token on npmjs.org with read and
     write on the `@lautstark` scope *and* permission to create packages,
     stored as an organisation secret `NPM_TOKEN` on GitHub. With this, the
     first version of every package is published by the workflow itself on
     the next `feat:` or `fix:` that lands - nothing is done by hand.
   - **Trusted publishing** (no secret to rotate): npm trusts this workflow's
     identity directly. It can only be configured on a package that already
     exists, so the first version is published by hand once, from a clean
     checkout of `main`:
     ```
     npm login
     npm ci && npm run build && npm publish --access public
     ```
     then on npmjs.org: the package → Settings → Trusted Publisher → GitHub
     Actions, organisation `Lautstark`, repository `sicherung`, workflow
     `release.yml`; and a repository variable `NPM_TRUSTED_PUBLISHING` set
     to `true` so the workflow knows to try.
3. Nothing. Renovate is already installed on the organisation; the first
   published version is what its `@lautstark/**` rule starts from.

After that, every push to main is a candidate release and nothing here needs a
person again.

## Never move a published tag

If a tag is wrong, cut the next version: a `fix:` commit. Re-pointing `v1.1.0`
leaves consumers with lockfiles pinned to a commit that no longer matches the
tag, and nothing warns them. Since 2026-09-16 that goes for the npm side too —
a published version cannot be replaced, only deprecated (`npm deprecate`) and
superseded.

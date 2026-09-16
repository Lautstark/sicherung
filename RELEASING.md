# Releasing

**Since 2026-09-16 the release is cut by CI, from the commit subjects.**
Nobody runs `npm version` any more and nobody writes a tag. There is still
no registry: a **git tag is the release**, consumers pin
`github:Lautstark/sicherung#vX.Y.Z` as they always have, npm runs this package's
`prepare` on their machine, and Renovate moves the pin when a new tag
appears. The tag is still the thing that must never move. What changed is
who cuts it.

## What happens on a push to main

`.github/workflows/release.yml` calls the family's reusable workflow in
`Lautstark/.github`, which runs the gate — `npm run typecheck && npm test && npm run build` — and then
`semantic-release`, configured in `release.config.mjs`.

semantic-release reads every commit since the last `v*` tag and decides:

| subjects since the last tag contain | bump |
|---|---|
| `feat!:`, or a `BREAKING CHANGE:` trailer | **major** |
| `feat:` | **minor** |
| `fix:`, `perf:` | **patch** |
| only `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:` | none — green, nothing tagged |

If there is a bump, it writes the version into `package.json` and the
lockfile's mirror of it, prepends the notes to `CHANGELOG.md`, commits the
three as `chore(release): x.y.z`, tags that commit `vx.y.z`, and writes a
GitHub release with the same notes. Then it checks that the tag on the commit
and `package.json` are one number — the check the old tag-triggered CI made,
asked of the commit it just tagged.

**So the bump is decided when the commit is written, not when the release is
cut.** The commit subject is the release note and the version at once, which
is why `commit-messages.yml` refuses a subject without a prefix. The notes go
in the commit body, where the tag annotation used to carry them.

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

Consumers pin this package by tag, and Renovate merges a minor or a patch
into them on its own once their tests pass. A major waits for a
person. That is the whole reason the prefix has to be honest: the number is a
resolver input again, and `feat:` on a change that breaks a consumer reaches
that consumer's main without anybody reading it.

## Never move a published tag

If a tag is wrong, cut the next version: a `fix:` commit. Re-pointing `v1.1.0`
leaves consumers with lockfiles pinned to a commit that no longer matches the
tag, and nothing warns them. Since 2026-09-16 that goes for the npm side too —
a published version cannot be replaced, only deprecated (`npm deprecate`) and
superseded.

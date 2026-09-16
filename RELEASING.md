# Releasing

**Since 2026-09-16 this package is published to npmjs.org as
`@lautstark/sicherung`, prebuilt.** `dist/` is in the tarball and there is no
`prepare` script any more: a consumer installs compiled output and compiles
nothing. The `github:Lautstark/sicherung#vX.Y.Z` pins still resolve for every
tag cut before that date, and no tag cut after it carries a build step — so a
consumer that wants anything newer than v1.16.1 takes it from npm.

A **git tag is still the release**, and it is still the thing that must never
move. What changed is who cuts it: see below.

## Cutting v1.0.0

`package.json` already says `1.0.0` and has never been tagged, so `npm version`
has nothing to bump. Run the gate by hand and tag:

```
npm run typecheck && npm test && npm run build
git tag -a v1.0.0 -m "1.0.0"
git push --follow-tags
```

Annotated, because that is what `npm version` creates and the tags should not
be two different kinds of object.

## Every release after that

From a clean `main`:

```
npm version minor -m "chore(release): %s"
```

The message template is not optional. `npm version`'s default subject is the
bare number, and `.githooks/commit-msg` refuses it — the hook arrived after this
document did, and for one release the two disagreed with each other rather than
with the person following them.

`preversion` runs typecheck, tests and the build first, so a broken tree cannot
be tagged. Nothing has left your machine yet — check `git show --stat HEAD`,
then `git push --follow-tags`. The push is deliberately separate: a pushed tag
can be resolved by a consumer within seconds and must never be moved
afterwards, so the irreversible half is its own command.

## Which bump

The three products pin by exact tag, so a bump reaches nobody until a consumer
changes its `package.json`. That makes the number documentation rather than a
resolver input — which is a reason to keep it honest, not a reason to relax.

- **patch** — a fix with no API change.
- **minor** — new exports, new optional options.
- **major** — anything a consumer must change code for: a removed export, a new
  `Status` kind they must draw, a changed return shape.

**A new `Status` kind is a major.** A product renders the status as a closed
set, and a kind it has never heard of renders as nothing at all — which in this
package means a backup that looks absent while it is fine, or fine while it is
absent. Both are the failure this whole thing exists to prevent.

A change to what may enter through `produce` — or a new inlet beside it — is
also always major, whatever the diff size. See the allow-list test in
`test/sicherung.test.ts`; consumers inherit the licensing behaviour described
in the README without inheriting the README.

## Never move a published tag

If a tag is wrong, cut the next version. Re-pointing `v1.1.0` leaves consumers
with lockfiles pinned to a commit that no longer matches the tag, and nothing
warns them.

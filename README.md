# sicherung

A backup that writes itself into a folder the user picked.

Shared by [bildhaft](https://github.com/Lautstark/bildhaft),
[mitreden](https://github.com/Lautstark/mitreden) and
[vorlaut](https://github.com/Lautstark/vorlaut). MIT.

## Why a folder and not a cloud account

A folder inside Dropbox, iCloud Drive or Nextcloud is already synced by
software the user installed on purpose. Writing a file there is the whole of
the cloud story: no account, no OAuth client, no token to refresh, no server of
ours, and nothing that has to appear in a privacy notice beyond the sentence
the user already understands — *it goes in the folder you chose*.

That is the entire idea. Everything in this package is plumbing under it.

## Where it works

Chromium on the desktop. Nowhere else.

`showDirectoryPicker` is absent from Safari and Firefox on every platform, and
absent from **every browser on Android**, Chrome included — Android has no
system picker that maps onto the API.

So this is a convenience for whoever prepares content on a laptop. It is not
the backup story for a tablet, and a product must not present it as one: keep
the ordinary download button, and show this only when `Sicherung.supported`.

## What it cannot do

The package holds no database, no store, and no reference to anything a
product keeps. The `produce` callback is the only way data enters it.

That is structural, not a promise in a comment — there is no code path here
that could read a symbol, a filename index or a cached image, because there is
nothing here to read them from. `test/sicherung.test.ts` asserts the public
surface as an allow-list so a new inlet cannot arrive unnoticed.

It matters because of METACOM: that collection is licensed per person, and
nothing derived from a user's folder may leave the browser — not even a list of
filenames. A folder inside Dropbox *is* somewhere else. So the rule for every
consumer is one line long, and easy to hold because the inlet is one function:

> Pass the audited export. Never a raw dump of a database.

## Use

```js
import { Sicherung } from '@lautstark/sicherung';

const backup = new Sicherung({
  app: 'bildhaft',
  produce: () => exportEverything(),   // the audited export, nothing else
});

backup.subscribe(drawStatus);
await backup.restore();                // no prompt; safe at startup

chooseButton.onclick = () => backup.choose();    // needs a user gesture
confirmButton.onclick = () => backup.confirm();  // needs a user gesture

onEveryEdit(() => backup.schedule());  // debounced
```

### Options

| | |
|---|---|
| `app` | Which product. Namespaces the stored folder. |
| `stem` | Filename stem. Defaults to `app`. |
| `produce` | Returns the payload. The only inlet. |
| `keep` | Dated copies to keep. Default 14. |
| `settle` | Debounce before writing, ms. Default 4000. |

### What lands in the folder

```
bildhaft-aktuell.json      always the newest
bildhaft-2026-08-23.json   one per day, pruned to `keep`
```

Dropbox keeps versions of its own, but a folder on a plain disk does not, and
the dated copies are the half that has to work without a sync client under it.

## Status

`restore()`, `choose()`, `confirm()`, `forget()` and `save()` all resolve to
the current `Status`, and `subscribe()` reports every change.

| kind | means |
|---|---|
| `unsupported` | No picker in this browser. Show the download button instead. |
| `off` | Supported, no folder chosen. |
| `needs-permission` | Set up, and **writing nothing** until the user clicks. |
| `idle` | Chosen, permitted, current. |
| `saving` | Writing now. |
| `failed` | Last attempt threw. The folder is kept. |

### Say how old the last copy is

Every status that has a folder carries `lastWrite`, including the failing ones.
Use it.

A stored handle survives a restart, but the browser may want it re-confirmed,
and confirming needs a click nobody is there to give at startup. So the state
that matters is not *broken* — it is `needs-permission`: set up, looks fine,
writing nothing. **A backup that silently stops is worse than no backup,
because it manufactures confidence.** "Letzte Sicherung: vor 11 Tagen" is the
only line that actually tells somebody whether they are safe.

## Drawing the panel — `@lautstark/sicherung/ui`

The three products each drew this panel and each wrote out the same table of
what to offer in which state. That table is a behavioural contract, and three
copies with nothing asserting they agree is the arrangement where one of them
quietly stops offering a way out of `failed`. It lives here now.

```js
import { actionsFor, ago } from '@lautstark/sicherung/ui';

for (const action of actionsFor(backup, status)) {
  panel.append(button(t(`folder_${action.id}`), action.primary, action.run));
}
```

`needsAttention(status)` says whether a state is one the person has to act
on - `needs-permission` and `failed`, the two in which nothing is being written
and nothing resumes by itself. A panel draws those as a warning rather than as
prose; see conventions.md §3.7 in @lautstark/design.

`actionsFor(backup, status)` returns `{ id, primary, run }` — `id` is one of
`choose`, `confirm`, `retry`, `forget`. It is a **key, not a label**: the
product supplies its own word for it.

| status | offers |
|---|---|
| `off` | `choose` |
| `needs-permission` | `confirm`, `forget` |
| `failed` | `retry`, `forget` |
| `idle` | `forget` |
| `saving`, `unsupported` | nothing |

`ago(at, locale, now?)` turns a `lastWrite` into "vor 3 Minuten". It builds its
formatter per call and **must never cache one**: a product that changes
language without reloading would go on being answered in the language the
reader has just left, and the string would stay well-formed the whole time.

### What this module deliberately is not

It returns no text and no DOM.

No text, because bildhaft has no `t()` — an argued position, not an omission:
it turns *German* sentences into pictograms, so an English shell would front a
program that only understands German input. A shared module that rendered
words would force on it exactly the indirection it exists to refuse.

No DOM, because the two shapes genuinely differ — bildhaft builds a node and
hands it back, mitreden and vorlaut paint into markup their page already has.
Product layout is identity (design.md §4.4), and a helper serving both would
be a configuration object pretending to be a component.

It imports nothing at runtime. Both of its imports are types, so the built
`dist/ui.js` has no imports at all — the inlet rule in `index.ts` is held one
layer further out by the compiler rather than by a promise.

### The one rule that is not code

The dot's attribute takes `status.kind` **verbatim**:

```js
line.setAttribute('data-state', status.kind);
```

No mapping table in the product. A mapping is three chances to disagree about
what `failed` looks like, invisible until it matters, and `@lautstark/design`
styles these kinds by name. An unknown kind falls back to the grey `off` dot
and reads as *deliberately not set up* — which is why a new `Status` kind is a
major for the CSS as well as for this package.

## Releasing

A git tag is the release; see [RELEASING.md](RELEASING.md).

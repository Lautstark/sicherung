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

## Releasing

A git tag is the release; see [RELEASING.md](RELEASING.md).

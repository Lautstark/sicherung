# ADR 0001 — A folder can be the store, and this package grows a reading half

**Status:** proposed · **Date:** 2026-09-01 · **Applies to:**
`@lautstark/sicherung` — `src/index.ts`, `src/store.ts`, `src/types.ts`,
`package.json`'s `exports` — and `@lautstark/design`'s
[`conventions.md`](https://github.com/Lautstark/design/blob/main/docs/conventions.md)
§2.3

## Context

This package writes and does not read. That is not an omission: `src/index.ts`
opens by saying it holds no database, no store and no reference to anything a
product keeps, and that `produce()` is the only way data enters it. The claim is
structural rather than a promise in a comment — `getFileHandle` appears once in
`src/`, to obtain a writable, and nothing anywhere reads a file back.
`test/sicherung.test.ts` asserts the names on `Sicherung.prototype` as an
allow-list, so a method that could read a database arrives as a new name and has
to be argued for. `confirmEmpty` was argued for on 2026-08-28, and the test's own
comment records that it refused the change until somebody came and wrote down
why.

Everything else follows from the direction. A product owns its data; `produce()`
hands over an audited export; the folder receives a copy. `<stem>-aktuell.json`
is replaced on every settled write, and one dated copy per day is cut beside it
and pruned to `keep`, default 14. The `Status` union describes a place we write
to, and every kind that has a folder carries `lastWrite`, because a backup that
silently stops manufactures confidence and the age of the last real copy is the
only number that tells anybody whether they are safe.

Wochenwerk arrives with the premise reversed.
[Its ADR 002](https://github.com/Lautstark/wochenwerk/blob/main/docs/decisions/002-browser-only-and-a-shared-folder.md)
puts a household calendar in a folder several people write into: the folder owns
the data, the browser holds a copy of it, and the central problem is conflicts,
which a one-writer backup cannot have. That ADR names four things it needs and
then declines to decide where they live — open a folder and keep the handle,
read and write one record per file, notice that a file changed, and surface a
conflict as a choice — on the grounds that it changes a package three shipping
products depend on and the decision belongs here.

Three things about those three products bear on the answer, and all three were
checked rather than assumed.

**They pin a tag, not a range.** bildhaft, mitreden and vorlaut-editor each
depend on `github:Lautstark/sicherung#v1.4.0`. Nothing published here reaches
any of them until somebody deliberately moves the ref, so "additive" here is a
stronger guarantee than it is against a caret range. (A frozen copy of vorlaut
inside `vorlaut-editor/third_party/` still pins v1.2.0; it is not a live
consumer and nothing below is written for it.)

**The type-level breakage surface is narrow and known.** All three switch
exhaustively over `Line['key']` with no default arm, so a new `Line` key is a
compile error in all three — deliberately, per `src/ui.ts`'s own note. bildhaft
alone also switches exhaustively over `status.kind`, in its `headline()`; the
other two never branch on the kind and write it verbatim into `data-state`,
where an unknown kind degrades to the grey `off` dot. A new `Action['id']` is a
compile error in bildhaft and mitreden and a missing i18n key at run time in
vorlaut. None of the three subclasses `Sicherung`, wraps it, or reflects over
it.

**None of them is remotely close to a per-record store today.** All three
`produce` a whole-library dump with top-level arrays, and all three
`looksEmpty` predicates cast the produced value to those array names. Their
IndexedDB schemas are per-record and would map onto files cleanly — bildhaft and
mitreden key `collections` and `sentences`/`phrases` by `id`, vorlaut keys
`collections`, `layouts` and a `symbols` store that is already a name-to-bytes
map — but nothing above the storage layer is written that way.

Two alternatives were live. A **sibling package** would let the reading half be
designed without a backwards-compatibility argument in every paragraph; it is
rejected in the Why below. **Widening `Sicherung` itself** — reading methods on
the same class, reading kinds in the same `Status` — is the shape that looks
smallest from outside and is rejected for the sharpest reason available: it
would delete the one guarantee this package is built on.

## Decision

**A folder may be a product's store rather than a copy of it. That half ships
from this package as a second object on its own subpath, and `Sicherung` does
not change.**

Concretely:

- **A product keeps its data either in IndexedDB or in a chosen folder, never
  both as sources.** There is never a second source of truth to reconcile. A
  product moving its store into a folder stops holding the original in the
  browser on the same day; there is no interim in which both are authoritative.

- **Where the folder is the store, the folder is the truth and the browser's
  copy is a mirror.** On start, the folder is read and the local copy is
  replaced wholesale. On write, both are written. When the folder is unreachable
  the product serves the mirror and says it is stale, and no write is accepted
  into a stale mirror.

- **One record per file, named by the record's `id`, each carrying
  `updatedAt`.** Both fields already exist family-wide — `conventions.md` §1.1
  makes identity a `crypto.randomUUID()` and §1.4 makes `updatedAt` a field with
  a reader — so this is a filename convention rather than a new obligation.

- **Conflicts are reported, never merged.** A sync client that cannot merge
  writes a second file beside the first. The store notices both, says so, names
  the two stamps, and the person picks which survives. A merge is attempted only
  where it is trivially safe, and by default it is not attempted at all.

- **Real two-way sync is not built, and the deferral is permanent until somebody
  argues it back.** See the Why.

- **Chromium on the desktop, exactly as before.** `showDirectoryPicker` is
  absent from Safari, from Firefox and from every browser on Android including
  Chrome. A store that cannot be opened is not a store, so this is not a
  progressive enhancement: a product whose users are not all on Chromium desktop
  cannot move its store into a folder at all, and keeps IndexedDB and the
  one-way backup.

- **The new surface is `@lautstark/sicherung/ablage`,** a third subpath beside
  `.` and `./ui`, exporting a class `Ablage` and its own status union, its own
  `actionsFor`, `lineFor` and `needsAttention`, and a re-export of `ago`. The
  name is German because the package and its one class already are, and because
  *Ablage* is what a household calls the place papers go — it is the store,
  where a *Sicherung* is the safeguard. The name is the least load-bearing part
  of this decision.

- **Nothing on the existing surface changes.** No new method on
  `Sicherung.prototype`, so the allow-list test is untouched and still means
  what it means. No new `Status` kind, so bildhaft's `headline()` still
  compiles. No new `Line` key and no new `Action['id']`, so all three products
  compile unchanged. `Options` gains one optional field, `into` (below), and
  optional fields break nobody. This is a minor.

### The surface, in prose

**Opening a folder** is the same four verbs `Sicherung` already has, for the
same reasons and with the same gesture rules. `restore()` re-attaches at startup
and never prompts. `choose()` opens the picker and must be called from a click.
`confirm()` re-asks for a remembered folder and must be called from a click.
`forget()` puts it down and leaves the files where they are. `subscribe()`
returns an unsubscribe. `status` is a getter. This half is a near-copy, and that
is the argument for it being in this package rather than beside it.

**The handle is keyed separately from the backup's**, in the same object store
in the same database. `src/store.ts` keys `folders` by `app` today; an `Ablage`
for `app: 'wochenwerk'` must not silently adopt the folder a `Sicherung` for
`wochenwerk` was pointed at. A folder somebody chose to *receive copies* is not
a folder they have agreed should hold the original, and scattering records into
what a person thinks of as their backup folder would be this package deciding
something the person did not. It is a prefix on the key and it is invisible to
the three products.

**Reading** is `list()`, `read(id)` and `all()`. `list()` returns each record's
`id`, its `updatedAt` and nothing else; `read(id)` returns one record's parsed
contents; `all()` is the startup read that the mirror is replaced from. This
package therefore learns two field names, `id` and `updatedAt`, where
`Sicherung` knows nothing at all about what it writes. That is a real loss of
ignorance and it is the minimum: a filename has to come from somewhere, and a
conflict cannot be reported without something to report about the two sides.

**Writing** is `write(record)` and `remove(id)`. `write` takes a record already
carrying its `id` and a fresh `updatedAt` — the package does not mint either,
because §1.1 and §1.4 already say who does — and replaces one file through
`createWritable()`, which is atomic for the same reason `Sicherung`'s `#put` is.
`remove` deletes one file. Neither accepts a write while the store is `stale`;
both resolve to the status rather than throwing, because every state in this
package is a state a panel can draw and an exception is not.

**Noticing a change** is `poll()`, which relists the folder and reports which
ids appeared, changed or went. The product drives the interval, because the
rhythm belongs to the product — wochenwerk's board wants seconds, a planning
view wants far less — and `watch(ms)` is a convenience over it that stops on
`forget()`. Whether `FileSystemObserver` is available and dependable in the
Chromium versions these households actually run has not been established here;
if it is, it replaces the timer underneath `poll()` and changes nothing above
it.

**A conflict** is surfaced as a state and answered with a choice.
`conflicts()` returns, per affected `id`, the candidate files with their
filenames and their `updatedAt` stamps; `resolve(id, filename)` writes the
chosen one into the canonical `<id>.json` and removes the others. The package
never picks. The detection rule is name-based: any `.json` file in the records
folder whose name contains a known `id` but is not exactly `<id>.json` is a
candidate for that id, which works because every sync client this was reasoned
about decorates the stem rather than replacing it. That has been reasoned about
and not tested — see What is not settled.

**The status union reuses `Sicherung`'s vocabulary wherever the word means the
same thing** and adds two. `unsupported`, `off`, `needs-permission`, `idle`,
`saving` and `failed` carry over unchanged, because `needs-permission` on a
store means exactly what it means on a backup — set up, looks fine, nothing
moving — and because `@lautstark/design` styles `data-state` by name, so a
shared word is a shared dot for free. The two new ones are **`stale`**, meaning
the folder is unreachable and the mirror is being served read-only, and
**`conflicted`**, meaning at least one record has two candidates and carries
their ids. Both are `needsAttention`, and both are new CSS: per the README's
rule, a new kind is a major for `@lautstark/design` even though it is a minor
here.

**The mirror is the product's, not this package's.** `Ablage` moves records
between a folder and the caller; it holds no records, offers no place to put
them, and keeps `src/store.ts` holding exactly what it holds today — a
capability and a mark. A version of this design that owned the mirror was
worked through and dropped: `store.ts` says in its own header that this
database exists *outside* the products' databases so that "alle Daten löschen"
does not reach it, which is right for a folder handle and catastrophic for a
copy of the calendar. Deleting everything would leave a complete second copy in
a database the person cannot see and no product's reset touches. So the mirror
rule above is a rule products keep, stated here because it is the same rule for
all of them, and not a mechanism this package supplies.

### What lands in the folder

The package states what it puts where rather than doing it silently, because it
cannot tell whether a chosen folder is shared with anybody or synced off-site,
and a person opening the folder in Finder is entitled to recognise what is in
it. Folder names are German, because unlike everything else in this repository
they are read by the household.

```
<the folder they chose>/
  wochenwerk/            one folder per app, named by Options.app
    termine/             one folder per kind of record
      3f9c….json         one record, named by its id
    ablage.json          what wrote here, when, and to which schema
  sicherungen/           dated exports, if a Sicherung runs beside it
  METACOM/               the household's own. Ours never creates or reads it.
```

Namespacing by `app` is what lets two products share one chosen folder without
either walking the other's records, and it is what leaves room at the top of the
tree for something that is not ours. `ablage.json` names the app, the schema
version and the last write. **It carries no count and no listing of what is in
the folder**, and that is deliberate: whether a count would be "a count of a
licensed collection" under §2.3 depends on what the consuming product happens to
store, and a manifest whose safety depends on its consumer is a manifest that
is one day unsafe.

**A household may want its licensed METACOM folder inside the same chosen folder
so there is one picker rather than two, and the structure allows it.** It is
achievable in more than principle: `@lautstark/bildquelle` already exposes
`useDirectoryHandle(handle)` for exactly this — a handle the host already holds,
granting, in its own words, a capability identical to its own picker — so an
`Ablage` could hand it `<chosen>/METACOM` and the person would pick once.

**This package will not do it, and will not offer to.** Two reasons, and the
second is the one that decides it. `Ablage` holds `readwrite` on the whole
chosen folder; today a household grants `bildquelle` `read` on the METACOM
folder alone, and nesting the collection would silently widen a licensed
collection's grant to read-write for a calendar that has no business writing
there. And a folder that is the store is very likely inside a sync client, so
moving METACOM into it would move a per-person licensed collection onto
somebody's cloud and then onto every device sharing the folder — as the doing of
a package that cannot detect either condition. A household that arranges this
for itself has made a decision about its own licence; a package that arranges it
for them has made that decision on their behalf, wrongly, and at scale.

### What happens to the backup

**Dated copies stop earning their place inside a store, and go on earning it
beside one.** `Ablage` writes none, and `keep` does not move to it.

The reasoning for `keep` is written at `src/index.ts`'s dated-copy branch:
Dropbox keeps versions of its own, a folder on a plain disk does not, and the
dated copy is the half that has to work without a sync client under it. That
argument is about a *copy* — something the product can regenerate, kept in case
the copy is wrong. Inside a store there is nothing to regenerate from, and a
dated copy becomes a second full copy of the store living in the store: files
the sync client also replicates, that `list()` and the conflict rule have to
learn to ignore, and that double what the folder holds. The failure `keep`
defends against cannot arrive the same way either, because there is no
`produce()` re-derivation step — a record is written when a person edits that
record, so there is no moment at which an empty database is faithfully saved
over a full folder. That failure, seen on 2026-08-28 and the reason `held`
exists, is a property of whole-library exports and it does not follow the data
into a per-record store.

What does not change is that **the package cannot tell a synced folder from a
plain one.** So a household whose folder is on a plain disk still has no version
history, and for them a dated export is the whole of the safety net. That is
what `Sicherung` already is, and it survives a store's move into a folder
unaltered: `produce()` reads the product's own mirror, the export is the same
audited export, and the file it writes is a copy nothing ever reads back except
a person restoring by hand. A copy is not a second source, so this does not
violate the rule above.

The one thing it needs is somewhere to go that is not the middle of the store,
which is `Options.into` — an optional subfolder name, created on demand,
defaulting to the folder's root so that the three products' behaviour is
byte-identical. That is an option and not a method, so the allow-list test is
untouched.

Whether a household on a sync client with version history should turn the dated
copies off is a real question and it is theirs. The default stays on and the
product says what it does.

### Whether `sicherung` is ever retired

**The condition is that every product in the family keeps its store in a folder,
on every browser its users actually have. It is not expected to be met.**

Naming it is worth more than the answer. The first half is plausible: the three
consumers' schemas are already per-record, and vorlaut's export already walks
records one at a time and only flattens at the return statement. The second half
is what will not be met, and the source says why in three places at once. All
three products carry the same comment at the head of their backup panel — a
tablet must not be shown a backup story it cannot have — and all three hide the
panel rather than disabling it. vorlaut-editor is a product with a real tablet
target, whole modules of it. A product with users on Safari, Firefox or Android
cannot move its store into a folder, because there is no picker to open it with;
its store stays in IndexedDB, and the one-way backup is then the only thing
standing between a cleared profile and a child's vocabulary. The population that
would gain most from a shared store is precisely the population that cannot have
one.

So `sicherung` does not retire, and the second half of that is the answer to the
sibling-package question: a package that must not be deleted and a package that
would eventually be deleted turn out to be the same package, and it is the one
that stays. That is the deciding argument, not the smaller one about additive
APIs.

## Why

**Extending is the only option that keeps the guarantee, and a sibling package
would have thrown it away for nothing.** The `produce()` inlet is worth what it
is worth because there is no code path here that could read a symbol, a filename
index or a cached image — there is nothing here to read them from. Reading
methods on `Sicherung` would end that sentence for bildhaft, mitreden and
vorlaut, who need no reader and would carry one anyway. A separate subpath and a
separate object end it for nobody: `Sicherung`'s prototype is still the same
nine names, the allow-list test still refuses the tenth, and a product that only
backs up does not import a line of the reading half. The shape that looks like
compromise is the one that preserves the property, and the shape that looks
cleanest — one class, both directions — is the one that destroys it.

**Two-way sync is deferred because the two things it needs are both unavailable
here, and neither becomes available by trying harder.** A deletion and a record
that has not synced yet are the same absence, and telling them apart needs
tombstones — records of things that are gone, which is a second kind of record
in the folder, with its own lifetime, its own conflicts and its own reason to be
pruned. And a winner cannot be picked by comparing `updatedAt` across machines,
because the stamps are written by clocks that disagree; `conventions.md` §1.4
already records vorlaut needing a strictly increasing stamp so that two writes
in one millisecond have an order, on one machine, where there is at least one
clock. This is exactly why `updatedAt` is *shown* rather than *compared*: the
package puts both stamps in front of the person and lets them read them, which
is a use of a stamp that survives clock drift, and does not use them to decide,
which is not. The mirror rule is a wholesale replace for the same reason — a
replace needs no tombstones, because it is not a merge.

**One record per file is what makes a conflict rare enough to be answered by
hand.** Wochenwerk's ADR 002 puts it better than a general statement could: per
appointment, a conflict needs two people editing the same appointment at the
same time, which does not happen; per calendar, it needs two people planning the
same evening, which does. Reporting rather than merging is affordable only
because of that, and the two decisions stand or fall together.

**The audit moves from one function to a type, and this is the cost of the
ADR rather than a detail of it.** `Sicherung`'s best property is that everything
which ever leaves passes through a single call a reviewer can look at, once,
before shipping. vorlaut's `backup_payload.test.ts` reads `app.ts` as *source*
to assert there is exactly one `new Sicherung(` and that it is handed
`exportEverything` — a test that exists because a behavioural test cannot catch
somebody handing the backup a raw dump. `Ablage` has no such chokepoint: records
go out one at a time, on every edit, forever, and what travels is whatever the
record type declares. So the reviewable artefact becomes the record type, in the
product, and a product moving its store into a folder owes the same audit it
would owe an export — by reading its own type and being able to say that no
field on it can hold a file, an index or a count. This package cannot do that
for them and must not appear to.

**The licence rule should be sharpened as wochenwerk proposes, and the reason is
that the sharpening describes code that already ships.** §2.3 forbids a
Sicherung carrying "a path into a licensed collection or a count of what is in
it", and records **Diverging: nobody**. Read against the source, the word
*path* is carrying two meanings that the products have already separated.
vorlaut's `src/data/backup.ts` drops the METACOM folder path and its file count
— where the household's copy lives, and a fact about what is in it — and lets
the board's own `metacom:` references travel, in its words: a reference is a
symbol the user chose and put on their own board, an index is an enumeration of
what they licensed; the first is their work, the second is the collection.
`tests/unit/backup_payload.test.ts` asserts both halves, and its header calls a
failure there "a leak or a licence, not a bug to triage". bildhaft draws the
same line. So the wording wochenwerk wants — *never the files of a licensed
collection, never an index of one and never a count; a reference to a single
item the person chose travels with the document that uses it* — is not a
loosening and not a local exception. It is the rule two consumers already keep,
written down. Supporting it costs this package nothing, and the change belongs
in `design`.

**What the sharpened rule then obliges is a restraint, not a feature.** A
reference travels *with the document that uses it* — that is the whole of the
permission, and the clause is doing work. A record that names one symbol a
person put on one appointment is that document. A manifest that lists what is in
the folder, a cache of resolved symbol paths written beside the records, an
index built once to make the board start faster: each is an enumeration rather
than a document, each is the kind of thing that gets added for a good reason,
and each would be the collection leaving. This is why `ablage.json` counts
nothing and why `Ablage` will not put METACOM inside its own tree. The rule is
easy to hold in `Sicherung` because there is one inlet; it is not easy to hold
in a store, and saying so is more use than a reassurance.

**Reusing the status vocabulary is the same argument the `data-state` rule
already made.** The README says the dot's attribute takes `status.kind`
verbatim, with no mapping table, because a mapping is three chances to disagree
about what `failed` looks like. A second union that renamed `needs-permission`
to something else for a store would be that mapping, moved up a level and made
permanent. Two new kinds is the honest count: `stale` and `conflicted` describe
states a backup genuinely cannot be in.

## Consequences

- **The single-inlet guarantee no longer covers the whole package.** The README
  sentence — the package holds no database and `produce` is the only way data
  enters — stays true of `Sicherung` and is false of `Ablage`, which reads a
  folder and writes what it is handed, record by record. The README has to say
  which half it is describing. What survives intact is the narrower and still
  valuable claim: this package holds no records, offers nowhere to put them, and
  cannot reach into a product's database, because the mirror stays in the
  product.

- **`@lautstark/design` needs two new `data-state` values before any product
  ships an `Ablage`.** `stale` and `conflicted` degrade to the grey `off` dot
  otherwise, which reads as *deliberately not set up* — the wrong sentence in
  both cases, and badly wrong for `conflicted`.

- **`src/store.ts` goes to database version 2.** Only to add a key prefix; the
  upgrade adds and touches nothing. The three products see nothing, and their
  remembered folders are not disturbed.

- **The three consumers are unaffected until somebody moves a tag.** They pin
  `#v1.4.0`, they compile against `Line`, `Action['id']` and — bildhaft alone —
  `Status['kind']`, and none of those changes. There is no work for them in this
  ADR and no reason for them to take the release.

- **A product cannot half-move.** The either-or rule means the day a store
  becomes a folder is a migration with a before and an after, not a feature
  flag. For the three existing products that migration is substantial and
  nothing here asks for it: their `produce` functions build whole-library dumps
  and their `looksEmpty` predicates are written against those top-level arrays,
  so a per-record store is a rewrite of the layer above storage, not a swap
  underneath it.

- **A store in a folder has no history unless something else gives it one.** If
  a household's folder is on a plain disk and the product does not run a
  `Sicherung` beside its `Ablage`, a record edited wrongly is edited wrongly and
  there is nothing to go back to. This is a real reduction in safety compared
  with the arrangement it replaces, and the mitigation is the dated export,
  which a product has to choose to run.

- **Wochenwerk can be built against this.** It gets its four things, on a
  subpath, from a package that is not going to be deleted underneath it.

## What is not settled

**Whether the conflict-detection rule holds outside Dropbox.** The name-based
rule assumes a sync client decorates the stem — `x (in Konflikt stehende Kopie
…).json` — rather than replacing it. That has been reasoned about and not tested
against iCloud Drive or Nextcloud, and a client that renames rather than
decorates would leave a conflict silently undetected, which is the worst
available failure for this feature. It should be tested against all three before
this ADR is accepted rather than proposed.

**Whether `FileSystemObserver` is usable.** `poll()` is specified as the
contract precisely so this can be answered later without the answer mattering
above the package boundary. Nothing here depends on it.

**Whether METACOM's licence permits a reference to travel at all.** Wochenwerk's
ADR 002 raises this and it is repeated rather than resolved: the licence text is
not a house rule, and a house rule cannot grant what the licence withholds. The
sharpened §2.3 describes what the code does and takes a defensible reading of
what "derived" means; it does not establish that the licence agrees. Somebody
has to read it before a folder holding `metacom:` references is shared outside a
household.

**Whether `stale` can be told from `failed` reliably enough to be worth two
words.** A folder that is unreachable because the sync client has it locked for
a second and a folder that is unreachable because it was moved to a disk that is
not there present identically to the browser. `stale` is specified as a state
about serving the mirror, which is a decision the package makes, rather than a
diagnosis of the folder, which it cannot make — but whether products can write
two sentences a person can act on differently is not established.

**Whether one picker for the store and METACOM is what households actually
want.** The structure allows it and this package refuses to arrange it, which
answers the technical question and not the human one. If it turns out that two
pickers is where setup fails, the answer is a product deliberately calling
`bildquelle`'s `useDirectoryHandle` with a handle it obtained itself, having
said so, and not this package doing it quietly.

## Not to be "fixed" later

**Somebody will propose folding `Ablage` into `Sicherung`.** One class, one
import, one folder handle, a `mode` option — and every argument for it will be
about the API being tidier, which it would be. What it would cost is the
allow-list test, because the allow-list is not a lint rule about class size: it
is the mechanism by which "this package cannot read anything a product holds"
stays true across changes made by people who never read `index.ts`'s header. The
test would have to be deleted or scoped away, and the day it is, the three
products that only ever needed to write are shipping a reader. What somebody
proposing the merge would have to establish is how the guarantee survives it.

**Somebody will propose merging conflicts, starting with the easy ones.** Two
edits to different fields of the same record; a record only one side touched.
Each such case is genuinely safe in isolation, and the set of them is not
closed — the next one always looks like the last one. The argument against is
not that merging is hard. It is that a merged record is a state nobody authored,
which nobody has seen and nobody can compare against anything, in a calendar a
household plans a disabled child's week with. ADR 0007 in vorlaut makes the same
argument about packages and makes it better. What a proposer would have to
establish is what the person is told after a merge, and how they find out it
happened.

**Somebody will propose dropping the dated copies once a store is in a folder,
everywhere.** The reasoning above concedes most of this: inside a store they do
not earn their place. The half that will get lost in the retelling is that this
package cannot see whether a sync client is under the folder, so "the folder has
version history" is an assumption about somebody else's machine. A proposer
would have to establish how the product knows.

**Somebody will propose that `sicherung` is now legacy.** It will look that way:
one half is the future, the other is a copy written into a folder. The condition
in the Decision is the whole answer — every product's store in a folder, on
every browser its users have — and the second clause is not a formality. A
product with tablet users has no picker, so it has no folder store, so it has
the one-way backup or it has nothing. Retiring the backup would take the safety
net from precisely the people who cannot have the replacement.

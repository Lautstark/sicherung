/*
 * The panel that says where the aging copy goes — once, for every product.
 *
 * `ui.ts` beside this one stops at the states, the actions and the arithmetic,
 * on the reasoning that the product supplies the words. `ablage-panel.ts` is
 * what happened when that reasoning was followed all the way for the *other*
 * folder question, and it records why it stopped being enough: products writing
 * their own sentences is a chance per product to disagree, and they did.
 *
 * This module is the same correction applied to the half that was left behind.
 * Four products drew this panel out of `actionsFor` and `lineFor` — bildhaft
 * 211 lines, vorlaut-editor 170, mitreden 161, and druckwerk 112 before that
 * product was deleted — and by the time they were read side by side they had
 * drifted in four ways that no test could see, because every copy was
 * internally consistent:
 *
 *   - **Only bildhaft carried a headline.** The one line that says which folder
 *     is being written without unfolding the panel, and the only one that keeps
 *     "being written" and "looks like it is" apart at a glance. Three products
 *     made the reader open the panel to learn it.
 *   - **Only bildhaft returned a `dispose`.** The other three subscribe on mount
 *     and never unsubscribe, so a settings dialog that is thrown away and built
 *     again leaves a listener painting a detached node, once per open.
 *   - **mitreden's English used German quotation marks** — „{folder}" in
 *     `folder_idle` and `folder_permission` — because the English arm was
 *     translated from the German one by hand and the quotes came with it.
 *   - **wochenwerk had no panel at all**, which is the drift taken to its
 *     conclusion: the only product in the family with a store in a folder and
 *     no aging copy behind it.
 *
 * So the words and the markup are here. What stays with the product is what
 * only it knows: which `Sicherung` this is, where a sentence goes when
 * something is said out loud, and which heading the state line belongs in.
 *
 * ## The words say nothing about what is being backed up
 *
 * „Wähle einen Ordner, dann wird die Sicherung dort hineingeschrieben, sobald
 * sich etwas ändert" is true of a library, a calendar, a layout and a print
 * sheet. The four copies each named their own product in that sentence, which
 * is the one thing that stopped it being shared. It is the same trick
 * `ablage-panel.ts` uses and for the same reason: no noun for the work means no
 * German case table and no product-shaped hole in the module.
 */

import type { Sicherung, Status } from './index.js';
import { actionsFor, ago, lineFor, needsAttention } from './ui.js';

export type PanelLang = 'de' | 'en';

export interface BackupPanelOptions {
  backup: Sicherung;
  /** Something to say out loud. Only `forget` says anything. */
  say: (line: string) => void;
  /**
   * A value, or a function read on every paint.
   *
   * The function form is not a convenience. mitreden changes language without
   * reloading, and its own copy of this panel took `lang()` on every call for
   * exactly that reason — a locale captured once goes on answering in the
   * language the reader has just left, and it stays well-formed the whole time,
   * which is what makes it hard to notice. tests/unit/backup-language.test.ts
   * over there is what caught this module taking it once.
   */
  lang?: PanelLang | (() => PanelLang);
  /**
   * Told the heading line on every repaint, so the panel's own summary carries
   * the folder without being unfolded. Blank where there is nothing to say.
   *
   * Optional because a product may have no heading to put it in — but it was
   * bildhaft's alone and is the reason bildhaft read best, so the default is to
   * offer it rather than to wait for a product to ask.
   */
  headline?: (text: string) => void;
}

export interface BackupPanel {
  node: HTMLElement;
  /**
   * Paint again without waiting for a status change.
   *
   * For the one thing that changes what this panel says while the status stands
   * still: the page's language.
   */
  refresh: () => void;
  /**
   * Must be called when the panel's container goes, or every rebuild adds a
   * listener painting a node nobody can see. Three of the four products this
   * replaced did not have one to call.
   */
  dispose: () => void;
}

/**
 * Every word this panel can say, in one shape per language.
 *
 * Declared rather than inferred, so that a key present in one language and
 * missing from the other does not compile. That is not hypothetical tidiness:
 * mitreden's English `folder_idle` and `folder_permission` carried German
 * quotation marks for as long as they existed, because the English arm was
 * translated by hand from the German one and nothing compared them.
 *
 * Filled positionally rather than through a placeholder syntax, because this
 * package has no i18n and is not growing one — two consumers have a `t()` and
 * two do not, and a `{folder}` convention here would be a third beside theirs.
 */
interface Words {
  note: string;
  off: string;
  saving: string;
  idle: (folder: string, age: string) => string;
  idleNever: (folder: string) => string;
  permission: (folder: string, age: string) => string;
  failed: (reason: string, age: string) => string;
  held: (folder: string, age: string) => string;
  never: string;
  last: (age: string) => string;
  forgotten: string;
  head: (folder: string) => string;
  headConfirm: (folder: string) => string;
  headFailed: (folder: string) => string;
  headHeld: (folder: string) => string;
  choose: string;
  confirm: string;
  retry: string;
  forget: string;
  'save-empty': string;
}

const WORDS: Record<PanelLang, Words> = {
  de: {
    note: 'Wähle einen Ordner, dann wird die Sicherung dort hineingeschrieben, sobald sich etwas ändert.',
    off: 'Noch kein Ordner für Sicherungskopien.',
    saving: 'Wird gesichert …',
    idle: (folder: string, age: string) => `Ordner „${folder}“ · gesichert ${age}`,
    idleNever: (folder: string) => `Ordner „${folder}“ · noch nie gesichert`,
    permission: (folder: string, age: string) => `Zugriff auf „${folder}“ muss bestätigt werden — ${age}.`,
    failed: (reason: string, age: string) => `Sicherung fehlgeschlagen: ${reason} — ${age}.`,
    held: (folder: string, age: string) =>
      `Dieser Browser ist leer. In „${folder}“ wurde nichts überschrieben — ${age}.`,
    never: 'noch nie gesichert',
    last: (age: string) => `zuletzt gesichert ${age}`,
    forgotten: 'Der Ordner wird nicht mehr beschrieben.',
    head: (folder: string) => `Ordner „${folder}“`,
    headConfirm: (folder: string) => `Ordner „${folder}“ · Zugriff bestätigen`,
    headFailed: (folder: string) => `Ordner „${folder}“ · Sicherung fehlgeschlagen`,
    headHeld: (folder: string) => `Ordner „${folder}“ · nichts überschrieben`,
    choose: 'Ordner wählen',
    confirm: 'Zugriff bestätigen',
    retry: 'Erneut versuchen',
    forget: 'Ordner vergessen',
    'save-empty': 'Trotzdem leer sichern',
  },
  en: {
    note: 'Choose a folder and the backup is written into it whenever something changes.',
    off: 'No folder for backup copies yet.',
    saving: 'Backing up …',
    idle: (folder: string, age: string) => `Folder “${folder}” · saved ${age}`,
    idleNever: (folder: string) => `Folder “${folder}” · never saved`,
    permission: (folder: string, age: string) => `Access to “${folder}” must be confirmed — ${age}.`,
    failed: (reason: string, age: string) => `Backup failed: ${reason} — ${age}.`,
    held: (folder: string, age: string) =>
      `This browser is empty. Nothing in “${folder}” was overwritten — ${age}.`,
    never: 'never saved',
    last: (age: string) => `last saved ${age}`,
    forgotten: 'The folder will no longer be written to.',
    head: (folder: string) => `Folder “${folder}”`,
    headConfirm: (folder: string) => `Folder “${folder}” · confirm access`,
    headFailed: (folder: string) => `Folder “${folder}” · backup failed`,
    headHeld: (folder: string) => `Folder “${folder}” · nothing overwritten`,
    choose: 'Choose folder',
    confirm: 'Confirm access',
    retry: 'Try again',
    forget: 'Forget folder',
    'save-empty': 'Save it empty anyway',
  },
};

/**
 * The sentence for a state.
 *
 * The two states that mean *nothing is being written* both carry the age, and
 * that is the point rather than a detail: „es funktioniert nicht" is a sentence
 * somebody can put off, and „seit elf Tagen nichts gesichert" is not. All four
 * products had worked that out and written it in their own margin.
 *
 * Exported for the test that holds the age rule. Nothing else calls it.
 */
export function sentenceFor(status: Status, lang: PanelLang = 'de'): string {
  const say = WORDS[lang];
  const line = lineFor(status);
  const aged = (at: number | null) => (at === null ? say.never : say.last(ago(at, lang)));
  switch (line.key) {
    case 'none': return '';
    case 'off': return say.off;
    case 'saving': return say.saving;
    case 'idle': return say.idle(line.folder, ago(line.lastWrite, lang));
    case 'idle-never': return say.idleNever(line.folder);
    case 'needs-permission': return say.permission(line.folder, aged(line.lastWrite));
    case 'failed': return say.failed(line.reason, aged(line.lastWrite));
    // Deliberately not phrased as a failure. Nothing broke: the copy in the
    // folder is whole and untouched, and the only open question is whether this
    // browser being empty is the truth.
    case 'held': return say.held(line.folder, aged(line.lastWrite));
  }
}

/**
 * The one line a panel's own heading carries.
 *
 * Deliberately not `sentenceFor`: a heading has no room for an age, and the age
 * is the whole reason the line inside the panel exists. What it must keep is
 * the distinction the rest of this module is built on — a folder that is being
 * written and one that only looks like it is are not the same fact, and a
 * heading showing just the name for both would manufacture exactly the
 * confidence a backup panel exists to avoid.
 *
 * Exported for that assertion. Nothing else calls it.
 */
export function headlineFor(status: Status, lang: PanelLang = 'de'): string {
  const say = WORDS[lang];
  switch (status.kind) {
    case 'unsupported':
    case 'off': return '';
    case 'idle':
    case 'saving': return say.head(status.folder);
    case 'needs-permission': return say.headConfirm(status.folder);
    case 'failed': return say.headFailed(status.folder);
    case 'held': return say.headHeld(status.folder);
  }
}

const make = (tag: string, cls?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Builds the block, or answers null where the browser has no picker.
 *
 * Null rather than an empty node, because a tablet must not be shown a backup
 * story it cannot have: `showDirectoryPicker` is absent from Safari, from
 * Firefox and from every browser on Android, and the ordinary download button
 * beside this is the whole offer there. The caller decides where the node goes
 * and this module never reaches up into a page.
 */
export function backupPanel(options: BackupPanelOptions): BackupPanel | null {
  /* Asked of the status rather than of `Sicherung.supported`, so that this
     module needs no value import of the class and a caller holding any object
     that answers the same shape can be tested against it. The two say the same
     thing: an unsupported browser has no other status to be in. */
  if (options.backup.status.kind === 'unsupported') return null;

  const reading = options.lang ?? 'de';
  const langNow = (): PanelLang => (typeof reading === 'function' ? reading() : reading);
  const tell = options.headline ?? (() => {});

  const line = make('p', 'standing');
  const actions = make('div', 'acts');
  const note = make('p', 'small muted');
  const node = make('div', 'backup-panel');
  node.append(note, line, actions);

  const button = (label: string, primary: boolean, run: () => Promise<unknown>) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `btn ${primary ? 'primary' : 'quiet'} sm`;
    node.textContent = label;
    node.addEventListener('click', () => {
      /* The gesture is the whole reason these are buttons: choose() and
         confirm() open a browser prompt and are refused without one. Disabled
         while the write is in flight, so a second press cannot start a second. */
      node.disabled = true;
      void run().finally(() => { node.disabled = false; });
    });
    return node;
  };

  function paint(status: Status): void {
    const lang = langNow();
    const say = WORDS[lang];
    tell(headlineFor(status, lang));

    /* data-state takes the kind verbatim. @lautstark/design styles these kinds
       by name, so a mapping here would be a fifth chance to disagree with the
       stylesheet about what `failed` looks like. */
    line.setAttribute('data-state', status.kind);
    /* Whether a state is somebody's to act on is this package's answer, the same
       as the buttons below. Every product drew `needs-permission` in the same
       grey as „gesichert vor 3 Minuten" until each was told separately.
       @lautstark/design conventions.md §3.7. */
    line.className = needsAttention(status) ? 'standing notice bad' : 'standing';
    note.textContent = say.note;
    line.replaceChildren(make('span', 'dot'), make('span', undefined, sentenceFor(status, lang)));

    /* Which buttons belong to which state is `actionsFor`, and was already
       shared. Two of its decisions were argued in four margins and are worth
       keeping findable here rather than in none of them: `idle` offers no "save
       now", because the folder is written on every change already and the
       button's only honest label would name the wrong axis beside „Sicherung
       als Datei"; and `saving` offers nothing at all rather than disabled
       buttons, which would flicker greyed on every debounce. */
    actions.replaceChildren(...actionsFor(options.backup, status).map((action) =>
      button(say[action.id], action.primary, async () => {
        await action.run();
        // The only one that says anything: the rest are reported by the status
        // line repainting underneath.
        if (action.id === 'forget') options.say(say.forgotten);
      })));
  }

  paint(options.backup.status);
  return {
    node,
    refresh: () => paint(options.backup.status),
    dispose: options.backup.subscribe(paint),
  };
}

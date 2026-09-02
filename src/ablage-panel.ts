/*
 * The panel that answers where a household's work lives — once, for every
 * product.
 *
 * `ablage-ui.ts` beside this one stops at the states and the actions, on the
 * reasoning that the product supplies the words. That was half right. Three
 * products writing their own sentences is three chances to disagree, and they
 * disagreed within a day of the second one being written: one said "der Kalender
 * liegt in X", the other "die Bibliothek liegt in X", and neither had the same
 * order of controls. Somebody moving between two Lautstark programmes has to
 * find the same panel, not a family resemblance.
 *
 * So the words and the markup are here, and what stays with the product is the
 * two things only it knows: what happens when a folder is adopted, and what it
 * offers *besides* the store — its own export, its own snapshot.
 *
 * The sentences are written to need no noun for the work. "Jedes Gerät, das den
 * Ordner erreicht, sieht dasselbe" is true of a calendar and of a library, which
 * is what lets one panel serve both without a German case table.
 */

import type { Ablage } from './ablage.js';
import { announcedFolder } from './ablage.js';
import type { AblageStatus } from './types.js';

export type PanelLang = 'de' | 'en';

export interface PanelOptions {
  store: Ablage;
  /** What the product does once a folder is settled on. */
  adopt: () => Promise<'pushed' | 'pulled' | 'incomplete'>;
  /** Everything on screen is about to be wrong. */
  changed: () => void;
  say: (line: string) => void;
  lang?: PanelLang;
  /** The name every Lautstark programme files under. */
  home?: string;
  /** Folder names that mean "this already gathers our work". */
  siblings?: string[];
  /**
   * The consent switch, where the product keeps a preference for it. Absent
   * means the product does not offer it, and no switch is drawn.
   */
  share?: { reads: () => boolean; write: (on: boolean) => Promise<void> };
  /** What the product offers besides the store: its own snapshot, its own file. */
  below?: () => (Node | null)[];
}

const WORDS = {
  de: {
    browser: 'In diesem Browser',
    browserNote: 'Auf diesem Gerät, und sonst nirgends. Nichts wird hochgeladen.',
    folder: (name: string) => `Im Ordner „${name}“`,
    folderNote: 'Jedes Gerät, das den Ordner erreicht, sieht dasselbe.',
    unreachable: 'Der Ordner ist nicht erreichbar',
    unreachableNote: 'Angezeigt wird der letzte Stand. Änderungen werden gerade nicht angenommen.',
    intro: 'Ein Ordner für alle Lautstark-Programme. Jedes legt darin sein eigenes Fach an.',
    offer: 'Ohne Ordner bleibt alles in diesem Browser. Das reicht für einen Haushalt mit einem Gerät.',
    noneYet: 'Noch keiner da? Wähle, wo er liegen soll — wir legen ihn dort an.',
    elsewhere: (app: string, name: string) =>
      `Auf diesem Gerät benutzt ${app} den Ordner „${name}“. Wähle ihn hier auch.`,
    same: 'Benutzt du schon ein anderes Lautstark-Programm, zeig hier auf denselben Ordner.',
    empty: (name: string) => `In „${name}“ liegt noch nichts von Lautstark.`,
    make: (home: string) => `Ordner „${home}“ anlegen`,
    direct: (name: string) => `„${name}“ direkt benutzen`,
    pick: 'Ordner wählen …',
    another: 'Anderer Ordner',
    forget: 'Ordner vergessen',
    retry: 'Nochmal versuchen',
    allow: 'Erneut erlauben',
    share: 'Anderen Lautstark-Programmen zeigen, wo der Ordner liegt',
    shareNote: 'Der Name steht dann in einem Cookie, das alle lautstark.tech-Seiten lesen und das bei jedem Aufruf mitgeht. Mehr wird nicht geteilt.',
    twice: (many: number) => `${many} Datei(en) liegen zweimal im Ordner.`,
    pushed: 'Der Ordner war leer — was hier lag, liegt jetzt dort.',
    pulled: 'Der Ordner hatte schon etwas — das gilt jetzt hier.',
    incomplete: 'Der Ordner ließ sich nicht ganz beschreiben. Es bleibt alles in diesem Browser.',
  },
  en: {
    browser: 'In this browser',
    browserNote: 'On this device, and nowhere else. Nothing is uploaded.',
    folder: (name: string) => `In the folder “${name}”`,
    folderNote: 'Every device that reaches the folder sees the same.',
    unreachable: 'The folder cannot be reached',
    unreachableNote: 'You are seeing the last state. Changes are not being taken right now.',
    intro: 'One folder for every Lautstark programme. Each makes its own compartment in it.',
    offer: 'Without a folder everything stays in this browser. That is enough for a household with one device.',
    noneYet: 'Do not have one? Choose where it should go — we will make it there.',
    elsewhere: (app: string, name: string) =>
      `On this device ${app} uses the folder “${name}”. Pick that one here too.`,
    same: 'If you already use another Lautstark programme, point this at the same folder.',
    empty: (name: string) => `There is nothing of Lautstark in “${name}” yet.`,
    make: (home: string) => `Make a folder “${home}”`,
    direct: (name: string) => `Use “${name}” directly`,
    pick: 'Choose a folder …',
    another: 'A different folder',
    forget: 'Forget the folder',
    retry: 'Try again',
    allow: 'Allow again',
    share: 'Show the other Lautstark programmes where the folder is',
    shareNote: 'The name then sits in a cookie that every lautstark.tech page can read and that travels with each request. Nothing else is shared.',
    twice: (many: number) => `${many} file(s) are in the folder twice.`,
    pushed: 'The folder was empty — what was here is there now.',
    pulled: 'The folder already held something — that applies here now.',
    incomplete: 'The folder could not be written completely. Everything stays in this browser.',
  },
} as const;

const make = (tag: string, cls?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (label: string, cls: string, onClick: () => void): HTMLButtonElement => {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `btn sm ${cls}`.trim();
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
};

const named = (status: AblageStatus) => ('folder' in status ? status.folder : '');

export interface Panel {
  node: HTMLElement;
  refresh: () => void;
}

export function wherePanel(options: PanelOptions): Panel {
  const say = WORDS[options.lang ?? 'de'];
  const home = options.home ?? 'Lautstark';
  const siblings = options.siblings ?? ['bildhaft', 'wochenwerk', 'mitreden', 'vorlaut'];
  const node = make('div', 'where-panel');

  /* The name of a folder somebody just picked that holds nothing of ours yet.
     It lives across renders because the question is asked in the panel rather
     than in a dialog over it: a dialog on top of a dialog is what this panel was
     rebuilt to stop doing. */
  let asking: string | null = null;

  const settle = async (nest: boolean) => {
    asking = null;
    if (nest) await options.store.nest(home);
    const went = await options.adopt();
    options.say(went === 'pushed' ? say.pushed : went === 'pulled' ? say.pulled : say.incomplete);
    options.changed();
    refresh();
  };

  const choose = async () => {
    await options.store.choose();
    const status = options.store.status;
    if (status.kind === 'off' || status.kind === 'unsupported') return refresh();
    const gathered = (await options.store.folders())
      .some((name) => siblings.includes(name.toLowerCase()));
    if (!(await options.store.adopted()) && !gathered) {
      asking = named(status);
      return refresh();
    }
    await settle(false);
  };

  function refresh(): void {
    const status = options.store.status;
    const held = status.kind !== 'off' && status.kind !== 'unsupported';
    const stale = status.kind === 'stale' || status.kind === 'failed';
    node.replaceChildren();
    const add = (...parts: (Node | null)[]) => {
      for (const part of parts) if (part) node.append(part);
    };

    if (asking) {
      /* Asked once, and only where the answer is genuinely open. */
      add(
        make('p', 'small', say.empty(asking)),
        make('pre', 'tree', `${asking}\n└── ${home}`),
        acts(
          button(say.make(home), 'primary', () => void settle(true)),
          button(say.direct(asking), 'quiet', () => void settle(false)),
        ),
      );
      return;
    }

    if (!held) {
      /* The picture before the decision: one folder, a compartment per
         programme. Five lines answer what three paragraphs do not. */
      const other = announcedFolder();
      add(
        make('p', 'small', say.intro),
        /* This programme's own compartment first: a picture of somebody else's
           two folders explains the idea and not their situation. */
        make('pre', 'tree', `${home}\n├── ${options.store.app}/\n└── ${
          siblings.find((name) => name !== options.store.app) ?? 'wochenwerk'}/`),
      );
      add(state(say.browser, say.browserNote, false));
      /* Two sentences in one paragraph rather than two stacked lines: the panel
         had grown a column of short muted paragraphs, which reads as a wall
         however short each one is. */
      add(
        make('p', 'small muted', `${say.offer} ${say.noneYet}`),
        make('p', 'small muted', other ? say.elsewhere(other.app, other.folder) : say.same),
        acts(button(say.pick, '', () => void choose())),
      );
    } else {
      add(state(
        stale ? say.unreachable : say.folder(named(status)),
        stale ? say.unreachableNote : say.folderNote,
        stale,
      ));
      if (status.kind === 'conflicted') {
        add(make('p', 'notice bad', say.twice(status.ids.length)));
      }
      if (options.share) add(sharing());
      add(acts(
        stale ? button(say.retry, 'primary', () => void choose()) : null,
        status.kind === 'needs-permission'
          ? button(say.allow, 'primary', () => void options.store.confirm().then(refresh)) : null,
        button(say.another, 'quiet', () => void choose()),
        button(say.forget, 'destructive', () => void options.store.forget().then(refresh)),
      ));
    }

    for (const part of options.below?.() ?? []) if (part) node.append(part);
  }

  const state = (title: string, note: string, bad: boolean): HTMLElement => {
    const box = make('div', `where${bad ? ' bad' : ''}`);
    box.append(make('b', undefined, title), make('span', 'small faint', note));
    return box;
  };

  const acts = (...parts: (Node | null)[]): HTMLElement => {
    const row = make('div', 'acts');
    for (const part of parts) if (part) row.append(part);
    return row;
  };

  /* Consent, where a reader knows what it means: beside the folder they just
     chose, off until they say so, and off again in the same place. What it
     stores is said outright — nobody can agree to what they were not told. */
  const sharing = (): HTMLElement => {
    const label = make('label', 'check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = options.share!.reads();
    box.addEventListener('change', () => {
      void options.share!.write(box.checked).then(refresh);
    });
    label.append(box, make('span', undefined, say.share));
    const wrap = make('div', 'where-share');
    wrap.append(label, make('p', 'small muted', say.shareNote));
    return wrap;
  };

  refresh();
  return { node, refresh };
}

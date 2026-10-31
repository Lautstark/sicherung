/*
 * „Deine Daten" — the one panel about where a household's work lives and how
 * it is kept, for every product. Its words, and the headline a product puts on
 * the panel frame around it.
 *
 * It replaces two panels and two loose button rows. Until 2026-10-31 a settings
 * sheet drew `AblagePanel`, then a subheading, a paragraph about snapshots,
 * `BackupPanel`, two buttons of the product's own and a note under them, and
 * then a separate panel to delete everything: seven controls and four
 * paragraphs before anybody learned whether their work was safe. Every product
 * of the family drew that column, and it was judged unreadable in all of them.
 *
 * So the answer comes first, in one box: where it is, and whether that is
 * safe. At most one button sits under it, and only when there is something to
 * do. Everything else — another folder, letting go of it, a backup file in and
 * out, a second folder for dated copies, deleting everything — is in the `⋯`
 * in that box's corner. Nothing the old column offered is gone; it is folded.
 *
 * The words are here and not in the products, for `ablage-panel.ts`'s reason:
 * somebody moving between two Lautstark programmes has to meet the same panel.
 * They are written to need no noun for the work, so a calendar and a library
 * can say them alike. What a product's file holds is the one thing that is not
 * the same everywhere, and a product says it through `file.note`.
 */

import type { AblageStatus } from './types.js';

export type PanelLang = 'de' | 'en';

export const WORDS = {
  de: {
    head: {
      folder: (name: string) => `im Ordner „${name}“`,
      browser: 'nur in diesem Browser',
      unreachable: 'Ordner nicht erreichbar',
      permission: 'Zugriff erlauben',
    },
    folder: (name: string) => `Alles liegt im Ordner „${name}“.`,
    folderNote: 'Jedes Gerät, das den Ordner erreicht, sieht dasselbe. Liegt er in iCloud, Dropbox oder Nextcloud, ist er dort auch gesichert.',
    browser: 'Alles liegt nur in diesem Browser.',
    browserNote: 'Löscht der Browser seine Daten oder geht das Gerät kaputt, ist es weg. Wähl einen Ordner, am besten in iCloud, Dropbox oder Nextcloud.',
    plain: 'Alles liegt in diesem Browser.',
    plainNote: 'Dieser Browser kann keinen Ordner benutzen. Lade ab und zu eine Sicherung herunter und leg sie in iCloud oder Dropbox.',
    unreachable: (name: string) => `Der Ordner „${name}“ ist gerade nicht erreichbar.`,
    unreachableNote: 'Du siehst den letzten Stand. Änderungen werden erst wieder gespeichert, wenn er erreichbar ist.',
    permission: (name: string) => `Der Ordner „${name}“ braucht deine Erlaubnis.`,
    permissionNote: 'Du siehst den letzten Stand. Änderungen werden erst wieder gespeichert, wenn du den Zugriff erlaubst.',
    pick: 'Ordner wählen …',
    allow: 'Zugriff erlauben',
    retry: 'Nochmal versuchen',
    more: 'Mehr',
    another: 'Anderer Ordner …',
    anotherNote: 'Auch: auf den Ordner eines anderen Lautstark-Programms zeigen.',
    forget: 'Ordner vergessen',
    forgetNote: 'Die Dateien bleiben im Ordner. Hier liegt dann alles wieder nur im Browser.',
    copies: (age: string) => `Tageskopie im selben Ordner, zuletzt ${age}.`,
    copiesNone: 'Tageskopie im selben Ordner, noch keine geschrieben.',
    copiesSaving: 'Tageskopie wird geschrieben …',
    keepForget: 'Automatisch sichern beenden',
    download: 'Sicherung herunterladen',
    downloadNote: 'Alles als eine Datei, zum Aufheben oder Mitnehmen.',
    read: 'Sicherung einlesen …',
    readNote: 'Fügt hinzu und überschreibt nie.',
    wipe: 'Alles löschen …',
    why: 'Warum ist das wichtig?',
    reasons: [
      'Der Browser darf seine Daten wegräumen, wenn der Speicher knapp wird oder jemand den Verlauf löscht.',
      'Ein Ordner in iCloud, Dropbox oder Nextcloud wird von deinem Rechner mitgesichert und ist auf jedem Gerät gleich. Es gibt kein Konto und keinen Server von uns.',
      'Im Ordner liegt außerdem eine Kopie für jeden Tag, die letzten 14 Tage. Sie hilft, wenn du selbst versehentlich etwas gelöscht hast. Ohne Ordner tut das eine heruntergeladene Sicherung.',
    ],
  },
  en: {
    head: {
      folder: (name: string) => `in the folder “${name}”`,
      browser: 'only in this browser',
      unreachable: 'folder unreachable',
      permission: 'allow access',
    },
    folder: (name: string) => `Everything is in the folder “${name}”.`,
    folderNote: 'Every device that reaches the folder sees the same. If it is in iCloud, Dropbox or Nextcloud, it is backed up there too.',
    browser: 'Everything is only in this browser.',
    browserNote: 'If the browser clears its data or the device breaks, it is gone. Choose a folder, ideally in iCloud, Dropbox or Nextcloud.',
    plain: 'Everything is in this browser.',
    plainNote: 'This browser cannot use a folder. Download a backup now and then and put it in iCloud or Dropbox.',
    unreachable: (name: string) => `The folder “${name}” cannot be reached right now.`,
    unreachableNote: 'You are seeing the last state. Changes are saved again once it can be reached.',
    permission: (name: string) => `The folder “${name}” needs your permission.`,
    permissionNote: 'You are seeing the last state. Changes are saved again once you allow access.',
    pick: 'Choose a folder …',
    allow: 'Allow access',
    retry: 'Try again',
    more: 'More',
    another: 'Another folder …',
    anotherNote: 'Also: point at the folder of another Lautstark programme.',
    forget: 'Forget the folder',
    forgetNote: 'The files stay in the folder. Here, everything is only in the browser again.',
    copies: (age: string) => `Daily copy in the same folder, last ${age}.`,
    copiesNone: 'Daily copy in the same folder, none written yet.',
    copiesSaving: 'Writing the daily copy …',
    keepForget: 'Stop backing up automatically',
    download: 'Download a backup',
    downloadNote: 'Everything as one file, to keep or to take along.',
    read: 'Read a backup …',
    readNote: 'Adds and never overwrites.',
    wipe: 'Delete everything …',
    why: 'Why does this matter?',
    reasons: [
      'A browser may clear its data when storage runs low or somebody clears the history.',
      'A folder in iCloud, Dropbox or Nextcloud is backed up by your computer and is the same on every device. There is no account and no server of ours.',
      'The folder also holds a copy for each day, the last 14 days. It helps when you deleted something by mistake yourself. Without a folder, a downloaded backup does that.',
    ],
  },
} as const;

/** Which states the box draws as not kept — the `.bad` frame and the danger
 *  dot. Only-in-the-browser is not one of them: it was said in words, and it
 *  is how every household starts. */
export const unkept = (status: AblageStatus): boolean =>
  status.kind === 'stale' || status.kind === 'failed' || status.kind === 'needs-permission';

/** The few words a product puts on the panel frame, beside „Deine Daten". */
export function headlineFor(status: AblageStatus, lang: PanelLang = 'de'): string {
  const head = WORDS[lang].head;
  switch (status.kind) {
    case 'unsupported':
    case 'off': return head.browser;
    case 'needs-permission': return head.permission;
    case 'stale':
    case 'failed': return head.unreachable;
    case 'idle':
    case 'saving':
    case 'conflicted': return head.folder(status.folder);
  }
}

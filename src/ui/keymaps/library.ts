/**
 * The key-binding library (ADR 0011): `library.json` describes every function
 * of a notation editor with its Finale and Logic Pro keys – implemented or
 * not. From it come the active keymaps (presets), the in-app key help and
 * docs/tastenbelegung.md.
 */
import type { CommandId } from '../../core/editor/commands';
import data from './library.json';

export type UiCommandId =
  | 'history.undo'
  | 'history.redo'
  | 'view.help'
  | 'file.new'
  | 'file.open'
  | 'file.import'
  | 'file.exportXml'
  | 'file.exportMidi'
  | 'file.exportPdf'
  | 'file.extractPart'
  | 'view.symbols'
  | 'file.save'
  | 'file.saveAs'
  | 'score.settings'
  | 'library.toggle'
  | 'view.roll'
  | 'play.toggle'
  | 'text.lyrics'
  | 'text.chord'
  | 'view.voiceTest'
  | 'play.record'
  | 'play.loopRange'
  | 'play.metronome'
  | 'play.cycle'
  | 'view.zoom'
  | 'file.print'
  | 'edit.quantize'
  | 'edit.copy'
  | 'edit.cut'
  | 'edit.paste'
  | 'edit.transpose'
  | 'view.palette';

/** Functions handled by the mouse, listed for the help only. */
export const MOUSE_COMMANDS = new Set([
  'mouse.drag',
  'mouse.dropChord',
  'mouse.rollOverdraw',
  'mouse.shapeMenu',
  'mouse.glideMenu',
  'mouse.playFrom',
  'mouse.dragSign',
  'midi.note',
  'mouse.tempoDrag',
  'mouse.keyCircle',
  'mouse.glideMany',
  'mouse.rollKey',
  'mouse.curvePoint',
  /** Buttons, menus and fields without a key: listed with `via` (where to find them). */
  'ui.control',
]);

export const UI_COMMANDS: ReadonlySet<string> = new Set<UiCommandId>([
  'history.undo',
  'history.redo',
  'view.help',
  'file.new',
  'file.open',
  'file.import',
  'file.exportXml',
  'file.exportMidi',
  'file.exportPdf',
  'file.extractPart',
  'view.symbols',
  'file.save',
  'file.saveAs',
  'score.settings',
  'library.toggle',
  'view.roll',
  'play.toggle',
  'text.lyrics',
  'text.chord',
  'view.voiceTest',
  'play.record',
  'play.loopRange',
  'play.metronome',
  'play.cycle',
  'view.zoom',
  'file.print',
  'edit.quantize',
  'edit.copy',
  'edit.cut',
  'edit.paste',
  'edit.transpose',
  'view.palette',
]);

export type PresetId = 'finale' | 'logic' | 'speedy';
export type KeySource = 'doku' | 'annahme' | 'icastico';

export interface PresetKeys {
  /** Plain list, or per argument (e.g. per note value). */
  readonly keys: readonly string[] | Readonly<Record<string, readonly string[]>>;
  readonly source: KeySource;
  readonly note?: string;
}

export interface LibraryFunction {
  readonly id: string;
  readonly title: string;
  /** Present = implemented in Icastico. */
  readonly command?: string;
  /** Where to find it when it has no key (a button, a menu, the sign palette): shown in the help instead of keys. */
  readonly via?: string;
  /** Argument → German label, e.g. "5" → "Viertel". */
  readonly args?: Readonly<Record<string, string>>;
  readonly finale?: PresetKeys;
  readonly logic?: PresetKeys;
  /** Finale-Ziffernblock; where missing, the Finale keys apply. */
  readonly speedy?: PresetKeys;
}

export interface LibraryGroup {
  readonly title: string;
  readonly functions: readonly LibraryFunction[];
}

export interface KeyLibrary {
  readonly version: number;
  readonly presets: Readonly<Record<PresetId, { readonly name: string; readonly description: string }>>;
  readonly groups: readonly LibraryGroup[];
}

export const KEY_LIBRARY = data as unknown as KeyLibrary;
export const PRESETS: readonly PresetId[] = ['finale', 'logic', 'speedy'];

export interface KeyBinding {
  readonly combo: string;
  readonly command: CommandId | UiCommandId;
  readonly arg?: number;
}

export interface HelpGroup {
  readonly title: string;
  readonly entries: readonly { readonly keys: string; readonly text: string }[];
}

export interface Keymap {
  readonly id: PresetId;
  readonly name: string;
  readonly description: string;
  readonly bindings: readonly KeyBinding[];
  readonly help: readonly HelpGroup[];
}

/** All (argument, keys) pairs of a function in a preset; argument undefined for plain lists. */
export function keyPairs(keys: PresetKeys['keys']): { arg: string | undefined; keys: readonly string[] }[] {
  if (Array.isArray(keys)) return [{ arg: undefined, keys: keys as readonly string[] }];
  const pairs = Object.entries(keys as Record<string, readonly string[]>).map(([arg, k]) => ({ arg, keys: k }));
  // Number keys read best in key order (Logic: 1 = Ganze, 2 = Halbe …).
  const digit = (p: { keys: readonly string[] }) => /^(Alt\+)?\d$/.test(p.keys[0] ?? '');
  return pairs.every(digit) ? pairs.sort((a, b) => a.keys[0]!.localeCompare(b.keys[0]!)) : pairs;
}

// ── Display ────────────────────────────────────────────────────────────────

const NAMES_PC: Record<string, string> = {
  Mod: 'Strg',
  Alt: 'Alt',
  Shift: 'Umschalt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Period: '.',
  Comma: ',',
  Plus: '+',
  Minus: '−',
  Space: 'Leertaste',
  Backquote: '`',
  Backspace: '⌫',
  Delete: 'Entf',
  Insert: 'Einfg',
  Escape: 'Esc',
  Enter: 'Enter',
};
const NAMES_MAC: Record<string, string> = { ...NAMES_PC, Mod: '⌘', Alt: '⌥', Shift: '⇧', Delete: '⌦' };
const numpadName = (p: string): string | null => (/^Num\d$/.test(p) ? `Ziffernblock ${p.slice(3)}` : null);

/** "Mod+Shift+Z" → "Strg+Umschalt+Z" (Windows) or "⌘⇧Z" (Mac). */
export function displayCombo(combo: string, mac = false): string {
  const names = mac ? NAMES_MAC : NAMES_PC;
  const parts = combo.split('+').map((p) => names[p] ?? numpadName(p) ?? p);
  return mac && parts.length > 1 ? parts.join('') : parts.join('+');
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

// ── Keymaps ────────────────────────────────────────────────────────────────

function helpEntry(fn: LibraryFunction, preset: PresetKeys, mac: boolean): { keys: string; text: string } {
  const pairs = keyPairs(preset.keys);
  if (pairs.length === 1 && pairs[0]!.arg === undefined) {
    const hint = fn.command && MOUSE_COMMANDS.has(fn.command) && preset.note ? ` – ${preset.note}` : '';
    return { keys: pairs[0]!.keys.map((k) => displayCombo(k, mac)).join(' / '), text: `${fn.title}${hint}` };
  }
  const shown = pairs.map((p) => displayCombo(p.keys[0]!, mac));
  const keys = shown.length > 3 ? `${shown[0]} … ${shown[shown.length - 1]}` : shown.join(' / ');
  const detail = pairs.map((p) => `${displayCombo(p.keys[0]!, mac)} = ${fn.args?.[p.arg!] ?? p.arg}`).join(' · ');
  return { keys, text: `${fn.title}: ${detail}` };
}

export function buildKeymap(id: PresetId, library: KeyLibrary = KEY_LIBRARY, mac = isMac()): Keymap {
  const bindings: KeyBinding[] = [];
  const help: HelpGroup[] = [];
  for (const group of library.groups) {
    const entries: { keys: string; text: string }[] = [];
    for (const fn of group.functions) {
      const preset = fn[id] ?? (id === 'speedy' ? fn.finale : undefined);
      const hasKeys = preset !== undefined && keyPairs(preset.keys).some((p) => p.keys.length > 0);
      if (fn.command && fn.via && !hasKeys) {
        entries.push({ keys: '–', text: `${fn.title} – ${fn.via}` });
        continue;
      }
      if (!fn.command || !preset || !hasKeys) continue;
      entries.push(helpEntry(fn, preset, mac));
      if (MOUSE_COMMANDS.has(fn.command)) continue;
      for (const pair of keyPairs(preset.keys)) {
        for (const combo of pair.keys) {
          bindings.push({
            combo,
            command: fn.command as CommandId | UiCommandId,
            ...(pair.arg !== undefined ? { arg: Number(pair.arg) } : {}),
          });
        }
      }
    }
    if (entries.length) help.push({ title: group.title, entries });
  }
  const meta = library.presets[id];
  return { id, name: meta.name, description: meta.description, bindings, help };
}

// ── Command palette (Ctrl+K) ───────────────────────────────────────────────

export interface PaletteEntry {
  readonly title: string;
  /** The heading the function stands under in the key help. */
  readonly group: string;
  /** Its key in the chosen layout, readable ("Strg+Umschalt+T"); empty when it has none. */
  readonly keys: string;
  readonly command: CommandId | UiCommandId;
  readonly arg?: number;
}

/** Every function that can be run, one entry per variant (e.g. per note value), with its key in the given layout. */
export function paletteEntries(id: PresetId, library: KeyLibrary = KEY_LIBRARY, mac = isMac()): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const group of library.groups) {
    for (const fn of group.functions) {
      if (!fn.command || MOUSE_COMMANDS.has(fn.command) || fn.command === 'view.palette') continue;
      const command = fn.command as CommandId | UiCommandId;
      const pairsIn = (p: PresetKeys | undefined) => (p ? keyPairs(p.keys) : []);
      const own = pairsIn(fn[id] ?? (id === 'speedy' ? fn.finale : undefined));
      const keysOf = (arg: string | undefined) => (own.find((p) => p.arg === arg)?.keys ?? []).map((k) => displayCombo(k, mac)).join(' / ');
      // The variants: named in `args`, or the arguments any layout has keys for.
      const variants = fn.args ? Object.keys(fn.args) : [...new Set([fn.finale, fn.logic, fn.speedy].flatMap((p) => pairsIn(p).flatMap((x) => (x.arg === undefined ? [] : [x.arg]))))];
      if (variants.length === 0) entries.push({ title: fn.title, group: group.title, keys: keysOf(undefined), command });
      for (const arg of variants) entries.push({ title: `${fn.title}: ${fn.args?.[arg] ?? arg}`, group: group.title, keys: keysOf(arg), command, arg: Number(arg) });
    }
  }
  return entries;
}

/** The entries that contain every word of the query (in title, heading or key); those whose title starts with it come first. */
export function searchPalette(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  const hits = entries.filter((e) => {
    const text = `${e.title} ${e.group} ${e.keys}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const first = (e: PaletteEntry) => (e.title.toLowerCase().startsWith(words[0]!) ? 0 : 1);
  return hits.sort((a, b) => first(a) - first(b)); // stable: otherwise the order of the key help
}

export function findBinding(keymap: Keymap, combo: string): KeyBinding | undefined {
  return keymap.bindings.find((b) => b.combo === combo);
}

// ── Document (docs/tastenbelegung.md) ──────────────────────────────────────

const SOURCE_MARK: Record<KeySource, string> = { doku: '', annahme: ' *(Annahme)*', icastico: ' *(Icastico)*' };

function docCell(fn: LibraryFunction, preset: PresetKeys | undefined): string {
  const pairs = preset ? keyPairs(preset.keys).filter((p) => p.keys.length) : [];
  if (!preset || !pairs.length) {
    const where = fn.via ? `${fn.via}` : '';
    const note = preset?.note ?? '';
    return where || note ? `*${[where, note].filter(Boolean).join(' – ')}*` : '–';
  }
  const code = (c: string) => (displayCombo(c).includes('`') ? `\`\` ${displayCombo(c)} \`\`` : `\`${displayCombo(c)}\``);
  const keys = pairs
    .map((p) => {
      const k = p.keys.map(code).join(' / ');
      return p.arg === undefined ? k : `${k} ${fn.args?.[p.arg] ?? p.arg}`;
    })
    .join(', ');
  return `${keys}${SOURCE_MARK[preset.source]}${preset.note ? ` – ${preset.note}` : ''}`;
}

/** The human-readable library, regenerated by `npm run keys:doc`. */
export function renderKeyDoc(library: KeyLibrary = KEY_LIBRARY): string {
  const lines = [
    '# Tastenbelegung – Bibliothek',
    '',
    '> Erzeugt aus `src/ui/keymaps/library.json` mit `npm run keys:doc` – nicht von Hand ändern.',
    '',
    'Alle Funktionen eines Notenprogramms mit ihren Tasten in **Finale**, **Logic Pro** und der',
    'Belegung **Finale-Ziffernblock** (Ziffernblock = Notenwert, obere Zahlenreihe = Intervall) –',
    'auch solche, die Icastico noch nicht kann („geplant“). In Icastico ist die Belegung',
    'umschaltbar (Tastenhilfe F1). `Strg` ist auf dem Mac `⌘`, `Alt` ist `⌥`.',
    '',
    '**Herkunft:** ohne Markierung = aus der Dokumentation des Programms ·',
    '*(Annahme)* = von uns gewählt, bitte prüfen · *(Icastico)* = eigene Ergänzung.',
    '',
  ];
  for (const group of library.groups) {
    lines.push(`## ${group.title}`, '', '| Funktion | Finale | Logic Pro | Finale-Ziffernblock | Icastico |', '|---|---|---|---|---|');
    for (const fn of group.functions) {
      const status = fn.command ? '✓' : 'geplant';
      lines.push(`| ${fn.title} | ${docCell(fn, fn.finale)} | ${docCell(fn, fn.logic)} | ${fn.speedy ? docCell(fn, fn.speedy) : '(wie Finale)'} | ${status} |`);
    }
    lines.push('');
  }
  lines.push(
    '## Quellen',
    '',
    '- Finale: [Simple Entry (Finale-Handbuch)](https://usermanuals.finalemusic.com/Finale2010Mac/Content/Finale/Simple_Entry2.htm), siehe ADR 0006',
    '- Logic Pro: [Tastaturbefehle Step-Input-Tastatur (Apple)](https://support.apple.com/en-gw/guide/logicpro/lgcp4fe41fb3/10.7/mac/11.0),',
    '  [Tastaturbefehle Hauptfenster/Editoren (Apple)](https://support.apple.com/guide/logicpro/main-window-tracks-and-various-editors-lgcpe8314fe2/mac)',
    '',
  );
  return lines.join('\n');
}

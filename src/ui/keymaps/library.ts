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
  | 'file.save'
  | 'file.saveAs'
  | 'score.settings'
  | 'library.toggle'
  | 'view.roll'
  | 'play.toggle';

/** Functions handled by the mouse, listed for the help only. */
export const MOUSE_COMMANDS = new Set([
  'mouse.drag',
  'mouse.dropChord',
  'mouse.rollOverdraw',
  'mouse.shapeMenu',
  'mouse.glideMenu',
  'mouse.curvePoint',
]);

export const UI_COMMANDS: ReadonlySet<string> = new Set<UiCommandId>([
  'history.undo',
  'history.redo',
  'view.help',
  'file.new',
  'file.open',
  'file.import',
  'file.save',
  'file.saveAs',
  'score.settings',
  'library.toggle',
  'view.roll',
  'play.toggle',
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
      if (!fn.command || !preset || keyPairs(preset.keys).every((p) => p.keys.length === 0)) continue;
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

export function findBinding(keymap: Keymap, combo: string): KeyBinding | undefined {
  return keymap.bindings.find((b) => b.combo === combo);
}

// ── Document (docs/tastenbelegung.md) ──────────────────────────────────────

const SOURCE_MARK: Record<KeySource, string> = { doku: '', annahme: ' *(Annahme)*', icastico: ' *(Icastico)*' };

function docCell(fn: LibraryFunction, preset: PresetKeys | undefined): string {
  if (!preset) return '–';
  const pairs = keyPairs(preset.keys).filter((p) => p.keys.length);
  if (!pairs.length) return preset.note ? `*${preset.note}*` : '–';
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

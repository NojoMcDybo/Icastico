/**
 * Import of anything that is not an Icastico file: MusicXML, MIDI (e.g. from Logic) and single-voice
 * recordings (WAV, AIFF, MP3, M4A …). Looks at what the bytes are, asks the few questions, returns the score.
 */
import { analyseRecording, audioDefaults, importRecording } from '../core/import/audio';
import { musicXmlText } from '../core/import/container';
import { importMidi, midiDefaults, parseMidi } from '../core/import/midi';
import { type ImportResult, ImportError, importMusicXml } from '../core/import/musicxml';
import { decodePcm } from '../core/import/wav';
import { decodeWithSystem } from '../platform/audio';
import type { ImportedFile } from '../platform/files';
import { importDialog } from './importDialog';

export type ImportKind = 'musicxml' | 'midi' | 'audio';

const AUDIO_EXTENSIONS = /\.(wav|wave|aif|aiff|aifc|mp3|m4a|aac|flac|ogg|oga|caf)$/i;

const ascii = (b: Uint8Array, at: number): string => String.fromCharCode(...b.slice(at, at + 4));

/** By the first bytes; the file name only decides for the compressed audio formats. */
export function importKind(file: ImportedFile): ImportKind {
  const { bytes, name } = file;
  if (ascii(bytes, 0) === 'MThd') return 'midi';
  if (ascii(bytes, 0) === 'RIFF' || ascii(bytes, 0) === 'FORM') return 'audio';
  if (/\.(mid|midi|smf)$/i.test(name)) return 'midi';
  if (AUDIO_EXTENSIONS.test(name)) return 'audio';
  return 'musicxml';
}

/** A small window while a recording is analysed (it can take a few seconds). */
function progressWindow(title: string): { update(share: number): void; close(): void } {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const box = document.createElement('div');
  box.className = 'modal__box';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const bar = document.createElement('progress');
  bar.max = 1;
  bar.value = 0;
  bar.style.width = '100%';
  box.append(heading, bar);
  overlay.append(box);
  document.body.append(overlay);
  return { update: (share) => (bar.value = share), close: () => overlay.remove() };
}

const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const instrumentLabel = (n: number): string => `${n} ${n === 1 ? 'Ton' : 'Töne'}`;

/** The score for a picked file; null if the user cancelled the questions. Throws an ImportError for files that cannot be read. */
export async function convertImport(file: ImportedFile): Promise<ImportResult | null> {
  const kind = importKind(file);
  if (kind === 'musicxml') return importMusicXml(musicXmlText(file.bytes), file.name);

  if (kind === 'midi') {
    const midi = parseMidi(file.bytes, file.name);
    const defaults = midiDefaults(midi);
    const tracks = midi.tracks.filter((t) => !t.drums);
    if (tracks.length === 0) throw new ImportError('Die MIDI-Datei enthält keine Spur mit Tönen (nur Schlagzeug oder nichts).');
    const chosen = await importDialog({
      title: 'MIDI importieren',
      intro: `„${file.name}“: Die gespielten Töne werden auf Notenwerte gerundet. Wähle, was übernommen wird.`,
      confirm: 'Importieren',
      tracks: tracks.map((t) => ({ id: t.index, name: t.name, detail: instrumentLabel(t.notes.length), instrument: defaults.tracks.find((x) => x.index === t.index)!.instrument, selected: true })),
      meter: defaults.meter,
      tempo: defaults.tempo,
      tempoHint: midi.tempo ? 'aus der Datei' : 'In der Datei steht kein Tempo.',
      fifths: defaults.fifths,
      quantize: defaults.quantize,
    });
    if (!chosen) return null;
    return importMidi(midi, { tracks: chosen.tracks.map((t) => ({ index: t.id, instrument: t.instrument })), quantize: chosen.quantize, meter: chosen.meter, tempo: chosen.tempo, fifths: chosen.fifths });
  }

  const samples = decodePcm(file.bytes) ?? (await decodeWithSystem(file.bytes));
  const progress = progressWindow('Aufnahme wird ausgewertet …');
  let found;
  try {
    found = await analyseRecording(samples, nextFrame, progress.update);
  } finally {
    progress.close();
  }
  const defaults = audioDefaults(found);
  const chosen = await importDialog({
    title: 'Aufnahme in Noten umwandeln',
    intro: `„${file.name}“ (${Math.round(found.seconds)} Sekunden, ${found.notes.length} Töne erkannt). Das Programm hört eine einzelne Stimme oder ein einzelnes Instrument heraus; Tonhöhen und Rhythmus bitte danach durchsehen.`,
    confirm: 'Umwandeln',
    tracks: [{ id: 0, name: file.name.replace(/\.[^.]+$/, ''), detail: instrumentLabel(found.notes.length), instrument: defaults.instrument, selected: true }],
    meter: defaults.meter,
    tempo: defaults.tempo,
    tempoHint: 'geschätzt – stimmt es nicht, bitte das Tempo der Aufnahme eintragen (in Logic: das Projekttempo)',
    fifths: defaults.fifths,
    quantize: defaults.quantize,
  });
  if (!chosen) return null;
  return importRecording(found, { instrument: chosen.tracks[0]!.instrument, quantize: chosen.quantize, meter: chosen.meter, tempo: chosen.tempo, fifths: chosen.fifths }, file.name.replace(/\.[^.]+$/, '') || 'Aufnahme');
}

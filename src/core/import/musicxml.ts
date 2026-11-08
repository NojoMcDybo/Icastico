/**
 * MusicXML (score-partwise) → Icastico score (ADR 0017).
 *
 * What is taken over: parts, staves and voices, notes, chords, rests, ties, key, meter changes,
 * an upbeat, the tempo, title and composer, the first verse of the lyrics and chord symbols
 * (ADR 0019). What is left out is reported (grace notes, more verses, tablature …) – nothing is
 * dropped silently.
 *
 * Pitches in Icastico are sounding pitches: a `<transpose>` of the part is applied; a guitar part
 * without one is taken as written an octave above sound (the convention for guitar).
 */
import { type Fraction, ZERO, add, compare, eq, frac, le, lt, sub } from '../time';
import { type Pitch, STEPS, midiOf, spellMidi } from '../pitch';
import { type InstrumentId, getInstrument } from '../instruments';
import {
  type StaffGroup,
  type BarMark,
  type ChordSymbol,
  type KeyChange,
  type Link,
  type MeterChange,
  type NoteEvent,
  type Part,
  type Score,
  type Voice,
  DEFAULT_TEMPO,
  MAX_TEMPO,
  MIN_TEMPO,
  measureLength,
  validateScore,
} from '../model';
import { placeable, writable } from './grid';
import { BAR_SIGNS, noteSymbol, toggleNoteSymbol, type BarSignKind } from '../symbols';
import { type XmlElement, XmlError, child, childText, childrenNamed, parseXml } from './xml';

export const KIND_TEXT: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'half-diminished': 'm7b5',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'dominant-13th': '13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
  none: '',
};

const noteName = (step: string | undefined, alter: string | undefined): string => {
  const a = Math.round(intOf(alter, 0));
  return `${step ?? ''}${a > 0 ? '#'.repeat(a) : a < 0 ? 'b'.repeat(-a) : ''}`;
};

/** "Am7/G" from a <harmony> element; null if there is no root (e.g. only a function name). */
function chordText(el: XmlElement): string | null {
  const root = child(el, 'root');
  const step = root ? childText(root, 'root-step') : undefined;
  if (!root || !step) return null;
  const kind = child(el, 'kind');
  const written = kind?.attrs.text;
  const suffix = written !== undefined ? written : (KIND_TEXT[kind?.text ?? ''] ?? kind?.text ?? '');
  const bass = child(el, 'bass');
  const bassName = bass && childText(bass, 'bass-step') ? `/${noteName(childText(bass, 'bass-step'), childText(bass, 'bass-alter'))}` : '';
  return `${noteName(step, childText(root, 'root-alter'))}${suffix}${bassName}`;
}

/** The syllable of the first verse of a note ("Hel-" when the word goes on), or null. */
function syllableOf(note: XmlElement): string | null {
  const verse = childrenNamed(note, 'lyric')[0];
  const text = verse ? childText(verse, 'text')?.trim().replace(/\s+/g, '_') : undefined;
  if (!verse || !text) return null;
  const syllabic = childText(verse, 'syllabic');
  return syllabic === 'begin' || syllabic === 'middle' ? `${text}-` : text;
}

const snap = (t: Fraction): Fraction => frac(Math.round((t.n * 64) / t.d), 64);

export class ImportError extends Error {
  override readonly name = 'ImportError';
}

export interface ImportResult {
  readonly score: Score;
  /** German remarks about what could not be taken over. */
  readonly notes: readonly string[];
}

interface Raw {
  readonly onset: Fraction;
  readonly duration: Fraction;
  readonly pitches: Pitch[];
  /** Tie from this note into the next one of the voice / from the previous one into this. */
  readonly tieStart: boolean[];
  readonly tieStop: boolean[];
  readonly lyric: string | null;
  /** Signs of the sign library found on / before the note (ADR 0024). */
  readonly marks: string[];
}

const ARTICULATIONS: Record<string, string> = { staccato: 'stacc', staccatissimo: 'stacciss', tenuto: 'ten', accent: 'acc', 'strong-accent': 'marc', 'breath-mark': 'breath', caesura: 'caesura' };
const ORNAMENTS: Record<string, string> = { 'trill-mark': 'trill', mordent: 'mord', 'inverted-mordent': 'prall', turn: 'turn' };

/** The signs of a note's <notations>; what the library does not know is counted in `unknown`. */
function notationMarks(note: XmlElement, unknown: () => void): string[] {
  const out: string[] = [];
  for (const n of childrenNamed(note, 'notations')) {
    for (const group of [child(n, 'articulations'), child(n, 'ornaments')]) {
      for (const sign of group?.children ?? []) {
        const id = ARTICULATIONS[sign.name] ?? ORNAMENTS[sign.name];
        if (id) out.push(id);
        else if (sign.name !== 'accidental-mark') unknown();
      }
    }
    if (child(n, 'fermata')) out.push('fermata');
    if (child(n, 'arpeggiate')) out.push('arpeggio');
  }
  return out;
}

const STEP_SET = new Set<string>(STEPS);

const intOf = (s: string | undefined, fallback: number): number => {
  const n = s === undefined ? NaN : Number(s);
  return Number.isFinite(n) ? n : fallback;
};

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z_]/, 'p$&');

function instrumentFor(name: string, program: number | undefined, staves: number): InstrumentId {
  if (staves >= 2) return 'piano';
  if (/guit|gitar|laute|lute|ukulele|banjo/i.test(name) || (program !== undefined && program >= 24 && program <= 31)) return 'guitar';
  if (/piano|klavier|keyboard|cembalo|harpsichord|organ|orgel|flügel/i.test(name)) return 'piano';
  return 'voice';
}

/** Beats of a time signature: "3+2" counts 5. */
const beatsOf = (s: string): number => s.split('+').reduce((sum, p) => sum + (parseInt(p, 10) || 0), 0);

export function importMusicXml(xml: string, fileName = ''): ImportResult {
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch (err) {
    if (err instanceof XmlError) throw new ImportError(`Das ist keine lesbare MusicXML-Datei. ${err.message}`);
    throw err;
  }
  if (root.name === 'score-timewise') throw new ImportError('Diese MusicXML-Datei ist „timewise“. Es wird nur die übliche „partwise“-Form gelesen.');
  if (root.name !== 'score-partwise') throw new ImportError('Das ist keine MusicXML-Partitur (Wurzel „score-partwise“ fehlt).');

  const notes: string[] = [];
  const skipped = new Map<string, number>();
  let roundedNotes = 0;
  const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1);

  const partList = child(root, 'part-list');
  const infos = new Map<string, { name: string; program: number | undefined }>();
  for (const sp of partList ? childrenNamed(partList, 'score-part') : []) {
    const midi = child(sp, 'midi-instrument');
    infos.set(sp.attrs.id ?? '', {
      name: childText(sp, 'part-name') ?? '',
      program: midi && childText(midi, 'midi-program') ? intOf(childText(midi, 'midi-program'), 1) - 1 : undefined,
    });
  }

  const partEls = childrenNamed(root, 'part');
  if (partEls.length === 0) throw new ImportError('Die Datei enthält keine Instrumente.');

  // Global structure from the first part.
  const meter: MeterChange[] = [];
  const keys: KeyChange[] = [];
  let tempo: number | undefined;
  let pickup: Fraction | undefined;
  /** Start of every measure, taken from the first part and reused for the others. */
  const starts: Fraction[] = [];

  const parts: Part[] = [];
  const partOfSource = new Map<string, string>();
  const chordSymbols = new Map<string, ChordSymbol>();
  const barMarks = new Map<string, BarMark>();
  const links: Link[] = [];
  let linkNumber = 0;

  partEls.forEach((partEl, partIndex) => {
    const sourceId = partEl.attrs.id ?? `P${partIndex + 1}`;
    const info = infos.get(sourceId) ?? { name: '', program: undefined };
    const measures = childrenNamed(partEl, 'measure');
    const staves = Math.max(1, ...measures.flatMap((m) => childrenNamed(m, 'attributes').map((a) => intOf(childText(a, 'staves'), 1))));
    const instrument = instrumentFor(info.name, info.program, staves);
    const def = getInstrument(instrument);
    if (instrument !== 'piano' && instrument !== 'guitar' && /./.test(info.name) && !/gesang|voice|vocal|sopran|alt|tenor|bass|chor|melod/i.test(info.name)) {
      notes.push(`„${info.name}“ wurde als ${def.name} übernommen (weitere Instrumente folgen).`);
    }
    if (staves > def.staves.length) notes.push(`„${info.name || sourceId}“ hat ${staves} Notensysteme; überzählige wurden auf das letzte gelegt.`);

    let divisions = 1;
    let sig = { count: 4, unit: 4 };
    let transpose = 0;
    let hasTranspose = false;
    let fifths = 0;
    let measureStart: Fraction = ZERO;
    const raws = new Map<string, Raw[]>(); // "staff:voice" → notes
    /** Slurs that have started (by number): they become the sign "slur" if they stop on the very next note of the voice. */
    const openSlurs = new Map<string, { key: string; raw: Raw; index: number }>();
    const comingMarks: string[] = []; // dynamics and wedges written before the note they belong to
    let voltaOpen = 0;
    let voltaClose = false;

    measures.forEach((measureEl, mi) => {
      const here = starts[mi] ?? measureStart;
      if (partIndex === 0) starts[mi] = here;
      let cursor = 0; // in divisions
      let furthest = 0;
      let lastOnset = 0;
      let last: Raw | null = null;
      const at = (pos: number): Fraction => add(here, frac(Math.round(pos), 4 * divisions));
      /** Bar signs are taken from the first part; every part has the same bars. */
      const addBar = (kind: BarSignKind): void => {
        if (partIndex === 0) barMarks.set(`${kind}@${here.n}/${here.d}`, { at: here, kind });
      };

      for (const el of measureEl.children) {
        if (el.name === 'attributes') {
          const d = childText(el, 'divisions');
          if (d) divisions = Math.max(1, Math.round(intOf(d, 1)));
          const time = child(el, 'time');
          if (time && childText(time, 'beats') && childText(time, 'beat-type')) {
            const next = { count: beatsOf(childText(time, 'beats')!), unit: intOf(childText(time, 'beat-type'), 4) };
            if (next.count > 0 && [1, 2, 4, 8, 16, 32].includes(next.unit) && (next.count !== sig.count || next.unit !== sig.unit || mi === 0)) {
              sig = next;
              if (partIndex === 0) meter.push({ at: here, sig });
            }
          }
          const key = child(el, 'key');
          if (key && childText(key, 'fifths') !== undefined) {
            const f = Math.max(-7, Math.min(7, Math.round(intOf(childText(key, 'fifths'), 0))));
            if (f !== fifths || mi === 0 || keys.length === 0) {
              fifths = f;
              if (partIndex === 0) keys.push({ at: here, fifths: f });
            }
          }
          const tr = child(el, 'transpose');
          if (tr) {
            transpose = Math.round(intOf(childText(tr, 'chromatic'), 0)) + 12 * Math.round(intOf(childText(tr, 'octave-change'), 0));
            hasTranspose = true;
          }
        } else if (el.name === 'backup') {
          cursor -= Math.round(intOf(childText(el, 'duration'), 0));
        } else if (el.name === 'forward') {
          cursor += Math.round(intOf(childText(el, 'duration'), 0));
          furthest = Math.max(furthest, cursor);
        } else if (el.name === 'direction' || el.name === 'sound') {
          const sound = el.name === 'sound' ? el : child(el, 'sound');
          const bpm = sound?.attrs.tempo ? Number(sound.attrs.tempo) : NaN;
          if (partIndex === 0 && tempo === undefined && Number.isFinite(bpm)) tempo = Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, Math.round(bpm)));
          for (const type of el.name === 'direction' ? childrenNamed(el, 'direction-type') : []) {
            for (const d of child(type, 'dynamics')?.children ?? []) if (noteSymbol(d.name)?.group === 'dynamic') comingMarks.push(d.name);
            const wedge = child(type, 'wedge');
            if (wedge?.attrs.type === 'crescendo') comingMarks.push('cresc');
            else if (wedge?.attrs.type === 'diminuendo') comingMarks.push('dim');
            if (child(type, 'segno')) addBar('segno');
            if (child(type, 'coda')) addBar('coda');
            const words = child(type, 'words')?.text.trim();
            if (words) {
              const sign = BAR_SIGNS.find((b) => b.text === words);
              if (sign) addBar(sign.id);
              else skip('Textanweisungen');
            }
          }
        } else if (el.name === 'harmony') {
          const text = chordText(el);
          const time = placeable(at(cursor)) ? at(cursor) : snap(at(cursor));
          if (!text) skip('Akkordsymbole ohne Grundton');
          else if (!chordSymbols.has(`${time.n}/${time.d}`)) chordSymbols.set(`${time.n}/${time.d}`, { at: time, text });
        } else if (el.name === 'note') {
          if (child(el, 'grace')) {
            skip('Vorschlagsnoten');
            continue;
          }
          const dur = Math.round(intOf(childText(el, 'duration'), 0));
          const isChord = child(el, 'chord') !== undefined;
          const onsetPos = isChord ? lastOnset : cursor;
          if (childrenNamed(el, 'lyric').length > 1) skip('Weitere Strophen');
          if (!isChord) {
            lastOnset = cursor;
            cursor += dur;
            furthest = Math.max(furthest, cursor);
          }
          if (child(el, 'rest') || dur <= 0) {
            if (!isChord) last = null;
            continue;
          }
          const pitchEl = child(el, 'pitch');
          if (!pitchEl) {
            if (child(el, 'unpitched')) skip('Schlagzeugnoten');
            continue;
          }
          const step = childText(pitchEl, 'step') ?? '';
          if (!STEP_SET.has(step)) continue;
          let pitch: Pitch = {
            step: step as Pitch['step'],
            alter: Math.round(intOf(childText(pitchEl, 'alter'), 0)),
            octave: Math.round(intOf(childText(pitchEl, 'octave'), 4)),
          };
          const shift = hasTranspose ? transpose : instrument === 'guitar' ? -12 : 0;
          if (shift !== 0) {
            const hasChromatic = hasTranspose && transpose % 12 !== 0;
            pitch = hasChromatic ? spellMidi(midiOf(pitch) + shift, fifths) : { ...pitch, octave: pitch.octave + shift / 12 };
          }
          const staff = Math.min(def.staves.length, Math.max(1, Math.round(intOf(childText(el, 'staff'), 1)))) - 1;
          const key = `${staff}:${childText(el, 'voice') ?? '1'}`;
          const tieStart = childrenNamed(el, 'tie').some((t) => t.attrs.type === 'start');
          const tieStop = childrenNamed(el, 'tie').some((t) => t.attrs.type === 'stop');
          let start = at(onsetPos);
          let finish = at(onsetPos + dur);
          if (!placeable(start) || !placeable(finish) || !writable(sub(finish, start))) {
            // e.g. a 9:8 tuplet: Icastico cannot write it, so it lands on the nearest 1/64
            start = snap(start);
            finish = snap(finish);
            roundedNotes++;
          }
          if (isChord && last && eq(last.onset, start)) {
            if (!last.pitches.some((p) => midiOf(p) === midiOf(pitch))) {
              last.pitches.push(pitch);
              last.tieStart.push(tieStart);
              last.tieStop.push(tieStop);
            }
            continue;
          }
          const marks = [...comingMarks.splice(0), ...notationMarks(el, () => skip('Zeichen, die es in der Bibliothek nicht gibt'))].reduce<string[]>((list, id) => (list.includes(id) ? list : toggleNoteSymbol(list, id)), []);
          const raw: Raw = { onset: start, duration: lt(start, finish) ? sub(finish, start) : frac(1, 64), pitches: [pitch], tieStart: [tieStart], tieStop: [tieStop], lyric: syllableOf(el), marks };
          const list = raws.get(key) ?? [];
          const slurs = childrenNamed(el, 'notations').flatMap((n) => childrenNamed(n, 'slur'));
          for (const sl of slurs.filter((x) => x.attrs.type === 'stop')) {
            const open = openSlurs.get(sl.attrs.number ?? '1');
            openSlurs.delete(sl.attrs.number ?? '1');
            if (!open) continue;
            if (open.key === key && list.length === open.index + 1) open.raw.marks.splice(0, open.raw.marks.length, ...toggleNoteSymbol(open.raw.marks, 'slur'));
            else skip('Bögen über mehrere Noten');
          }
          list.push(raw);
          raws.set(key, list);
          for (const sl of slurs.filter((x) => x.attrs.type === 'start')) openSlurs.set(sl.attrs.number ?? '1', { key, raw, index: list.length - 1 });
          last = raw;
        } else if (el.name === 'barline') {
          const repeat = child(el, 'repeat');
          if (repeat) addBar(repeat.attrs.direction === 'forward' ? 'repeatStart' : 'repeatEnd');
          else if (el.attrs.location !== 'left') {
            const style = childText(el, 'bar-style');
            if (style === 'light-light') addBar('doubleBar');
            else if (style === 'light-heavy') addBar('finalBar');
          }
          const ending = child(el, 'ending');
          if (ending?.attrs.type === 'start') voltaOpen = Math.min(3, Math.max(1, parseInt(ending.attrs.number ?? '1', 10) || 1));
          else if (ending) voltaClose = true;
        } else if (el.name === 'print' || el.name === 'figured-bass') {
          // layout only
        }
      }

      if (voltaOpen) addBar(`volta${voltaOpen}` as BarSignKind);
      if (voltaClose) voltaOpen = 0;
      voltaClose = false;

      // Length of this measure: the notated meter, except an incomplete first measure (upbeat).
      const full = measureLength(sig);
      const actual = frac(Math.max(0, Math.round(furthest)), 4 * divisions);
      let length = full;
      if (mi === 0 && partIndex === 0 && furthest > 0 && lt(actual, full) && (measureEl.attrs.implicit === 'yes' || measureEl.attrs.number === '0')) {
        pickup = actual;
        length = actual;
      } else if (mi === 0 && partIndex > 0 && pickup) {
        length = pickup;
      }
      measureStart = add(here, length);
      if (partIndex === 0 && mi + 1 < measures.length) starts[mi + 1] = measureStart;
    });

    // Build voices: one per "staff:voice", extra ones when events of a voice overlap.
    const voices: Voice[] = [];
    const eventIds = new Set<string>();
    const toneAt = new Map<string, string>(); // "voiceKey|onset|midi" → tone id (for ties)
    const pending: { key: string; from: string; end: Fraction; midi: number }[] = [];
    const sortedKeys = [...raws.keys()].sort((a, b) => (a.split(':')[0] === b.split(':')[0] ? Number(a.split(':')[1]) - Number(b.split(':')[1]) : Number(a.split(':')[0]) - Number(b.split(':')[0])));
    const partId = sanitize(sourceId) + (parts.some((p) => p.id === sanitize(sourceId)) ? `-${partIndex + 1}` : '');
    const voiceCountByStaff = new Map<number, number>();
    for (const key of sortedKeys) {
      const staff = Number(key.split(':')[0]);
      const list = raws.get(key)!.sort((a, b) => (lt(a.onset, b.onset) ? -1 : eq(a.onset, b.onset) ? 0 : 1));
      const lanes: { id: string; events: NoteEvent[]; end: Fraction }[] = [];
      for (const raw of list) {
        let lane = lanes.find((l) => le(l.end, raw.onset));
        if (!lane) {
          const n = (voiceCountByStaff.get(staff) ?? 0) + 1;
          voiceCountByStaff.set(staff, n);
          lane = { id: `${partId}-s${staff + 1}v${n}`, events: [], end: ZERO };
          lanes.push(lane);
          if (lanes.length > 1) notes.push(`In „${info.name || sourceId}“ überlappen Noten einer Stimme; sie liegen in einer zusätzlichen Stimme.`);
        }
        const id = `${lane.id}-n${lane.events.length + 1}`;
        eventIds.add(id);
        // Tones are sorted by sounding pitch; the tie flags travel with their tone.
        const order = raw.pitches.map((_, ti) => ti).sort((a, b) => midiOf(raw.pitches[a]!) - midiOf(raw.pitches[b]!));
        const tones = order.map((src, ti) => ({ id: `${id}-t${ti + 1}`, pitch: raw.pitches[src]!, src }));
        lane.events.push({ id, onset: raw.onset, duration: raw.duration, tones: tones.map(({ id: toneId, pitch }) => ({ id: toneId, pitch })), ...(raw.lyric ? { lyric: raw.lyric } : {}), ...(raw.marks.length ? { marks: raw.marks } : {}) });
        lane.end = add(raw.onset, raw.duration);
        tones.forEach((t) => {
          toneAt.set(`${key}|${raw.onset.n}/${raw.onset.d}|${midiOf(t.pitch)}`, t.id);
          if (raw.tieStart[t.src]) pending.push({ key, from: t.id, end: add(raw.onset, raw.duration), midi: midiOf(t.pitch) });
        });
      }
      for (const lane of lanes) voices.push({ id: lane.id, staff, events: lane.events });
    }
    for (const p of pending) {
      const to = toneAt.get(`${p.key}|${p.end.n}/${p.end.d}|${p.midi}`);
      if (to && !links.some((l) => l.to === to || l.from === p.from)) links.push({ id: `link-${++linkNumber}`, kind: 'tie', from: p.from, to });
    }
    for (let s = 0; s < def.staves.length; s++) {
      if (!voices.some((v) => v.staff === s)) voices.push({ id: `${partId}-s${s + 1}v1`, staff: s, events: [] });
    }
    voices.sort((a, b) => a.staff - b.staff);
    parts.push({ id: partId, name: info.name || def.name, instrument, voices });
    partOfSource.set(sourceId, partId);
  });

  // Brackets and braces of the part list: the parts between a part-group start and its stop.
  const groups: StaffGroup[] = [];
  const listed: string[] = [];
  const openGroups = new Map<string, { symbol: StaffGroup['symbol']; from: number }>();
  for (const el of partList?.children ?? []) {
    if (el.name === 'score-part') listed.push(el.attrs.id ?? '');
    else if (el.name === 'part-group') {
      const number = el.attrs.number ?? '1';
      if (el.attrs.type === 'start') {
        const symbol = childText(el, 'group-symbol');
        if (symbol === 'bracket' || symbol === 'brace' || symbol === 'square') openGroups.set(number, { symbol: symbol === 'brace' ? 'brace' : 'bracket', from: listed.length });
      } else if (el.attrs.type === 'stop') {
        const open = openGroups.get(number);
        openGroups.delete(number);
        const ids = open ? listed.slice(open.from).flatMap((id) => (partOfSource.get(id) ? [partOfSource.get(id)!] : [])) : [];
        if (open && ids.length >= 2 && !ids.some((id) => groups.some((g) => g.parts.includes(id)))) groups.push({ symbol: open.symbol, parts: ids });
      }
    }
  }

  if (meter.length === 0) meter.push({ at: ZERO, sig: { count: 4, unit: 4 } });
  if (keys.length === 0) keys.push({ at: ZERO, fifths: 0 });
  const work = child(root, 'work');
  const title = (work && childText(work, 'work-title')) || childText(root, 'movement-title') || fileName.replace(/\.[^.]+$/, '') || 'Importiert';
  const ident = child(root, 'identification');
  const composer = ident ? childrenNamed(ident, 'creator').find((c) => c.attrs.type === 'composer')?.text : undefined;

  const score: Score = {
    title,
    ...(composer ? { composer } : {}),
    meter,
    keys,
    ...(pickup ? { pickup } : {}),
    ...(tempo !== undefined && tempo !== DEFAULT_TEMPO ? { tempo } : {}),
    ...(links.length ? { links } : {}),
    ...(groups.length ? { groups } : {}),
    ...(barMarks.size ? { marks: [...barMarks.values()].sort((a, b) => compare(a.at, b.at) || BAR_SIGNS.findIndex((x) => x.id === a.kind) - BAR_SIGNS.findIndex((x) => x.id === b.kind)) } : {}),
    ...(chordSymbols.size ? { chords: [...chordSymbols.values()].sort((a, b) => compare(a.at, b.at)) } : {}),
    parts,
  };
  const problems = validateScore(score);
  if (problems.length > 0) {
    throw new ImportError(`Die Partitur lässt sich nicht übernehmen:\n- ${problems.slice(0, 5).join('\n- ')}`);
  }
  for (const [what, n] of skipped) notes.push(`${what}: ${n}× nicht übernommen.`);
  if (roundedNotes > 0) notes.push(`${roundedNotes} Noten haben einen Rhythmus, den Icastico nicht schreiben kann (nur Triolen, Quintolen und Septolen gehen); sie sind auf das 1/64-Raster gerundet.`);
  return { score, notes: [...new Set(notes)] };
}

/**
 * Score model → MEI 5 (input format of the Verovio engraving engine).
 *
 * MEI is a RENDER format here, not our file format. Every element gets an
 * xml:id; Verovio keeps these ids in the SVG, which lets the UI map a click
 * on a rendered note back to the model event (`elements` map).
 *
 * Written accidentals are decided here (Verovio draws what it is told):
 * standard rule – the key signature applies to all octaves, an accidental
 * applies to the same pitch (step + octave) until the end of the measure,
 * a note tied over from the previous measure shows no accidental.
 */
import { type Score, type Part, type Tone, eventEnd, locateTones, measuresOf, type Measure, validateScore } from '../core/model';
import { type Fraction, compare, div, gt, le, lt, sub, frac } from '../core/time';
import { getInstrument, type Clef } from '../core/instruments';
import { keyAlteration, type Pitch } from '../core/pitch';
import { GUITAR_STRINGS, assignFrets, type Fingering } from '../core/tab';
import {
  beamGroups,
  notateVoice,
  tupletGroups,
  type NotatedItem,
  type NotatedNote,
  type UnshownGap,
  type WrittenDuration,
} from '../core/notation/notate';

export interface ElementRef {
  readonly partId: string;
  readonly voiceId: string;
  /** Set for notes; rests have no model event. */
  readonly eventId?: string;
  /** The single tone this symbol stands for; absent for a whole chord, rests and measure rests. */
  readonly toneId?: string;
  readonly measureNumber: number;
  /** Global staff number (1-based, as in MEI). */
  readonly staffN: number;
  /** Where the symbol starts on the timeline (measure start for measure rests). */
  readonly onset: Fraction;
  /** `chordNote` = a single note inside a chord (same event as its chord). */
  readonly kind: 'note' | 'chordNote' | 'rest' | 'measureRest';
}

export interface MeiOptions {
  /** Make sure the score shows a measure containing this time (input caret). */
  readonly coverTime?: Fraction;
  /** Staves left out of the engraving (shown as piano roll instead), as `<partId>:<staffIndex>`. */
  readonly hiddenStaves?: ReadonlySet<string>;
}

/** A staff of the engraving: its MEI number and where it belongs in the score. */
export interface StaffInfo {
  readonly n: number;
  readonly partId: string;
  readonly staffIndex: number;
}

/** xml:id of a staff within a measure, e.g. for positioning the caret. */
export const staffElementId = (measureNumber: number, staffN: number): string => `m${measureNumber}-s${staffN}`;

export interface MeiResult {
  readonly mei: string;
  /** xml:id of a tablature note → the fret number to draw in its place (ADR 0022). */
  readonly tab: ReadonlyMap<string, string>;
  /** xml:id → model reference. */
  readonly elements: ReadonlyMap<string, ElementRef>;
  /** The staves that were engraved, top to bottom. */
  readonly staffs: readonly StaffInfo[];
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function keysigAttr(fifths: number): string {
  if (fifths === 0) return '0';
  return fifths > 0 ? `${fifths}s` : `${-fifths}f`;
}

function clefAttrs(clef: Clef): string {
  let a = `clef.shape="${clef.shape}" clef.line="${clef.line}"`;
  if (clef.octave !== 0) a += ` clef.dis="8" clef.dis.place="${clef.octave < 0 ? 'below' : 'above'}"`;
  return a;
}

const ACCID: Record<number, string> = { [-2]: 'ff', [-1]: 'f', 0: 'n', 1: 's', 2: 'x' };

function durAttrs(w: WrittenDuration): string {
  return `dur="${w.base}"${w.dots > 0 ? ` dots="${w.dots}"` : ''}`;
}

/** Tracks accidentals within one measure of one staff. */
class AccidentalState {
  private readonly altered = new Map<string, number>();
  constructor(private readonly fifths: number) {}

  /** Returns the attribute string for this pitch and updates the state. */
  attrsFor(p: Pitch, tiedFromPrevious: boolean): string {
    const key = `${p.step}${p.octave}`;
    const current = this.altered.get(key) ?? keyAlteration(this.fifths, p.step);
    const gestural = p.alter !== 0 ? ` accid.ges="${ACCID[p.alter]}"` : '';
    if (current === p.alter || tiedFromPrevious) return gestural;
    this.altered.set(key, p.alter);
    return ` accid="${ACCID[p.alter]}"`;
  }
}

/** SVG/MEI id of one notehead inside a chord; carries the tone id, so it survives re-sorting. */
const chordNoteId = (item: NotatedNote, tone: Tone): string => `${item.id}-${tone.id}`;

/** Where a lyric syllable sits in its word, from the "-" at the end of the syllables (MEI wordpos). */
function lyricXml(syllable: string, previousContinues: boolean): { xml: string; continues: boolean } {
  const continues = syllable.endsWith('-');
  const text = continues ? syllable.slice(0, -1) : syllable;
  const wordpos = continues ? (previousContinues ? 'm' : 'i') : previousContinues ? 't' : null;
  const attrs = wordpos ? ` wordpos="${wordpos}"${continues ? ' con="d"' : ''}` : '';
  return { xml: `<verse n="1"><syl${attrs}>${esc(text)}</syl></verse>`, continues };
}

function noteXml(item: NotatedNote, accidentals: AccidentalState, tiedIn: ReadonlySet<string>, indent: string, verse = ''): string {
  const tie =
    item.tiedFromPrevious && item.tiedToNext ? 'm' : item.tiedToNext ? 'i' : item.tiedFromPrevious ? 't' : '';
  const tieAttr = tie ? ` tie="${tie}"` : '';
  // A note tied in from the previous measure does not repeat its accidental.
  const pitchAttrs = (p: Pitch, toneId: string) =>
    `pname="${p.step.toLowerCase()}" oct="${p.octave}"${accidentals.attrsFor(p, item.tiedFromPrevious || tiedIn.has(toneId))}`;

  if (item.tones.length === 1) {
    const head = `${indent}<note xml:id="${item.id}" ${durAttrs(item.duration)} ${pitchAttrs(item.tones[0]!.pitch, item.tones[0]!.id)}${tieAttr}`;
    return verse ? `${head}>${verse}</note>` : `${head}/>`;
  }
  const notes = item.tones
    .map((t) => `${indent}  <note xml:id="${chordNoteId(item, t)}" ${pitchAttrs(t.pitch, t.id)}${tieAttr}/>`)
    .join('\n');
  return `${indent}<chord xml:id="${item.id}" ${durAttrs(item.duration)}>\n${notes}${verse ? `\n${indent}  ${verse}` : ''}\n${indent}</chord>`;
}

function itemXml(item: NotatedItem, accidentals: AccidentalState, tiedIn: ReadonlySet<string>, indent: string, verse = ''): string {
  switch (item.kind) {
    case 'note':
      return noteXml(item, accidentals, tiedIn, indent, verse);
    case 'rest':
      // The gap a glide travels through is time without a rest sign.
      return `${indent}<${item.invisible ? 'space' : 'rest'} xml:id="${item.id}" ${durAttrs(item.duration)}/>`;
    case 'measureRest':
      return `${indent}<mRest xml:id="${item.id}"/>`;
  }
}

interface StaffSlot {
  readonly n: number;
  readonly part: Part;
  readonly staffIndex: number;
  /** The tablature staff that goes with a guitar staff. */
  readonly tab?: boolean;
}

function staffGrpXml(score: Score, slots: StaffSlot[]): string {
  const lines: string[] = ['      <staffGrp>'];
  for (const part of score.parts) {
    const def = getInstrument(part.instrument);
    const own = slots.filter((s) => s.part === part);
    if (own.length === 0) continue;
    const staffDef = (s: StaffSlot, withLabel: boolean, ind: string) =>
      s.tab
        ? `${ind}<staffDef n="${s.n}" lines="${GUITAR_STRINGS.length}" keysig.visible="false" meter.visible="false"><label>Tab</label><labelAbbr>Tab</labelAbbr></staffDef>`
        : `${ind}<staffDef n="${s.n}" lines="5" ${clefAttrs(def.staves[s.staffIndex]!.clef)}>` +
          (withLabel ? `<label>${esc(part.name)}</label><labelAbbr>${esc(def.shortName)}</labelAbbr>` : '') +
          `</staffDef>`;
    if (own.length > 1) {
      lines.push(`        <staffGrp symbol="${def.brace ? 'brace' : 'bracket'}" bar.thru="true">`);
      lines.push(`          <label>${esc(part.name)}</label><labelAbbr>${esc(def.shortName)}</labelAbbr>`);
      for (const s of own) lines.push(staffDef(s, false, '          '));
      lines.push('        </staffGrp>');
    } else {
      lines.push(staffDef(own[0]!, true, '        '));
    }
  }
  lines.push('      </staffGrp>');
  return lines.join('\n');
}

function scoreDefChange(prev: Measure, m: Measure): string | null {
  const attrs: string[] = [];
  if (prev.sig.count !== m.sig.count || prev.sig.unit !== m.sig.unit) {
    attrs.push(`meter.count="${m.sig.count}" meter.unit="${m.sig.unit}"`);
  }
  if (prev.fifths !== m.fifths) attrs.push(`keysig="${keysigAttr(m.fifths)}"`);
  return attrs.length ? `      <scoreDef ${attrs.join(' ')}/>` : null;
}

export function scoreToMei(score: Score, options: MeiOptions = {}): MeiResult {
  const problems = validateScore(score);
  if (problems.length > 0) throw new Error(`Partitur ungültig:\n- ${problems.join('\n- ')}`);

  const measures = measuresOf(score, 1, options.coverTime);
  const elements = new Map<string, ElementRef>();

  // Global staff numbering across all parts.
  const slots: StaffSlot[] = [];
  for (const part of score.parts) {
    getInstrument(part.instrument).staves.forEach((_, staffIndex) => {
      if (options.hiddenStaves?.has(`${part.id}:${staffIndex}`)) return;
      slots.push({ n: slots.length + 1, part, staffIndex });
      if (part.tab && part.instrument === 'guitar' && staffIndex === 0) slots.push({ n: slots.length + 1, part, staffIndex, tab: true });
    });
  }
  if (slots.length === 0) throw new Error('Keine Zeile für die Notenschrift übrig.');

  // The gap a glide travels through is not drawn as a rest.
  const spots = locateTones(score);
  const links = score.links ?? [];
  const gapsByVoice = new Map<string, UnshownGap[]>();
  for (const l of links) {
    const a = spots.get(l.from);
    const b = spots.get(l.to);
    if (l.kind !== 'slide' || !a || !b || a.voice.id !== b.voice.id || !gt(b.event.onset, eventEnd(a.event))) continue;
    gapsByVoice.set(a.voice.id, [...(gapsByVoice.get(a.voice.id) ?? []), { from: eventEnd(a.event), to: b.event.onset }]);
  }

  // Notate every voice once: voiceId → items per measure.
  const notated = new Map<string, NotatedItem[][]>();
  /** First and last drawn piece of every event (an event that crosses barlines is drawn in several pieces). */
  const pieces = new Map<string, { first: NotatedNote; firstMeasure: number; last: NotatedNote; lastMeasure: number }>();
  for (const part of score.parts) {
    for (const voice of part.voices) {
      const slot = slots.find((sl) => sl.part === part && sl.staffIndex === voice.staff);
      if (!slot) continue; // this staff is shown as piano roll
      const perMeasure = notateVoice(voice, measures, gapsByVoice.get(voice.id));
      notated.set(voice.id, perMeasure);
      const staffN = slot.n;
      perMeasure.forEach((items, mi) => {
        const m = measures[mi]!;
        for (const it of items) {
          const base = { partId: part.id, voiceId: voice.id, measureNumber: m.number, staffN };
          if (it.kind === 'measureRest') {
            elements.set(it.id, { ...base, kind: 'measureRest', onset: m.start });
          } else if (it.kind === 'rest') {
            elements.set(it.id, { ...base, kind: 'rest', onset: it.onset });
          } else {
            const known = pieces.get(it.eventId);
            pieces.set(it.eventId, { first: known?.first ?? it, firstMeasure: known?.firstMeasure ?? m.number, last: it, lastMeasure: m.number });
            const ref: ElementRef = { ...base, kind: 'note', onset: it.onset, eventId: it.eventId };
            if (it.tones.length === 1) {
              elements.set(it.id, { ...ref, toneId: it.tones[0]!.id });
            } else {
              elements.set(it.id, ref);
              it.tones.forEach((t) => elements.set(chordNoteId(it, t), { ...ref, kind: 'chordNote', toneId: t.id }));
            }
          }
        }
      });
    }
  }

  // Ties and glides are control elements, written into the measure where they start.
  const controls = new Map<number, string[]>();
  const tiedIn = new Set<string>();
  const xmlIdOf = (item: NotatedNote, toneId: string): string =>
    item.tones.length === 1 ? item.id : chordNoteId(item, item.tones.find((x) => x.id === toneId)!);
  for (const l of links) {
    const a = spots.get(l.from);
    const b = spots.get(l.to);
    const pa = a && pieces.get(a.event.id);
    const pb = b && pieces.get(b.event.id);
    if (!a || !b || !pa || !pb) continue; // an end is on a staff shown as piano roll
    const start = xmlIdOf(pa.last, a.tone.id);
    const end = xmlIdOf(pb.first, b.tone.id);
    const staff = elements.get(pa.last.id)!.staffN;
    const list = controls.get(pa.lastMeasure) ?? [];
    if (l.kind === 'tie') {
      list.push(`<tie xml:id="tie-${l.id}" staff="${staff}" startid="#${start}" endid="#${end}"/>`);
      if (pa.lastMeasure !== pb.firstMeasure) tiedIn.add(b.tone.id);
    } else {
      const gap = gt(b.event.onset, eventEnd(a.event));
      list.push(`<gliss xml:id="gliss-${l.id}" staff="${staff}" startid="#${start}" endid="#${end}" lform="${gap ? 'solid' : 'dotted'}"/>`);
      if (gap) list.push(`<dir xml:id="port-${l.id}" staff="${staff}" startid="#${start}" place="above">port.</dir>`);
    }
    controls.set(pa.lastMeasure, list);
  }

  // Lyrics: the syllable is written on the first drawn piece of its note; "-" chains syllables into words.
  const syllables = new Map<string, string>();
  for (const part of score.parts) {
    for (const voice of part.voices) {
      let continues = false;
      for (const ev of voice.events) {
        if (ev.lyric === undefined) {
          continue;
        }
        const r = lyricXml(ev.lyric, continues);
        continues = r.continues;
        syllables.set(ev.id, r.xml);
      }
    }
  }

  // Tablature: which string and fret plays every tone of a guitar part with the tab staff switched on.
  const tabNotes = new Map<string, string>();
  const fingerings = new Map<string, ReadonlyMap<string, Fingering>>();
  for (const slot of slots) {
    if (!slot.tab) continue;
    const events = slot.part.voices.filter((v) => v.staff === slot.staffIndex).flatMap((v) => v.events);
    fingerings.set(slot.part.id, assignFrets([...events].sort((a, b) => compare(a.onset, b.onset))));
  }

  /** The notes of one measure of one voice on a tab staff: the same rhythm, at the string lines, numbers drawn later. */
  const tabItemXml = (item: NotatedItem, fingering: ReadonlyMap<string, Fingering>, indent: string): string => {
    if (item.kind === 'measureRest') return `${indent}<mRest xml:id="${item.id}-tab"/>`;
    if (item.kind === 'rest') return `${indent}<${item.invisible ? 'space' : 'rest'} xml:id="${item.id}-tab" ${durAttrs(item.duration)}/>`;
    const played = item.tones.map((t) => ({ t, f: fingering.get(t.id) })).filter((x): x is { t: Tone; f: Fingering } => x.f !== undefined);
    if (played.length === 0) return `${indent}<space xml:id="${item.id}-tab" ${durAttrs(item.duration)}/>`;
    const note = (id: string, f: Fingering) => {
      tabNotes.set(id, String(f.fret));
      return `<note xml:id="${id}" ${played.length === 1 ? durAttrs(item.duration) + ' ' : ''}loc="${(GUITAR_STRINGS.length - f.string) * 2}"/>`;
    };
    if (played.length === 1) return `${indent}${note(`${item.id}-tab`, played[0]!.f)}`;
    return `${indent}<chord xml:id="${item.id}-tab" ${durAttrs(item.duration)}>${played.map((x) => note(`${item.id}-${x.t.id}-tab`, x.f)).join('')}</chord>`;
  };

  const body: string[] = [];
  measures.forEach((m, mi) => {
    const change = mi > 0 ? scoreDefChange(measures[mi - 1]!, m) : null;
    if (change) body.push(change);
    // An upbeat is shorter than its meter: metcon="false" tells Verovio it is intended.
    const metcon = m.number === 0 ? ' metcon="false"' : '';
    body.push(`      <measure xml:id="m${m.number}" n="${m.number}"${metcon}>`);
    for (const slot of slots) {
      body.push(`        <staff xml:id="${staffElementId(m.number, slot.n)}" n="${slot.n}">`);
      const onStaff = slot.part.voices.filter((v) => v.staff === slot.staffIndex);
      // Voices without notes (e.g. after their only tone was deleted) draw nothing, unless the staff would be empty.
      const voices = onStaff.some((v) => v.events.length > 0) ? onStaff.filter((v) => v.events.length > 0) : onStaff.slice(0, 1);
      const accidentals = new AccidentalState(m.fifths);
      if (voices.length === 0) {
        body.push(`          <layer n="1"><mRest/></layer>`);
      }
      voices.forEach((voice, li) => {
        body.push(`          <layer n="${li + 1}">`);
        const items = notated.get(voice.id)![mi]!;
        const beams = beamGroups(items, m);
        const brackets = tupletGroups(items);
        const suffix = slot.tab ? '-tab' : '';
        const fingering = slot.tab ? (fingerings.get(slot.part.id) ?? new Map<string, Fingering>()) : null;
        items.forEach((item, i) => {
          const beam = beams.find(([a, b]) => i >= a && i <= b);
          const inBeam = beam !== undefined;
          const bracket = brackets.find((g) => g.start === i);
          if (bracket) body.push(`            <tuplet xml:id="${item.id}${suffix}-tuplet" num="${bracket.ratio.num}" numbase="${bracket.ratio.numbase}">`);
          if (beam && i === beam[0]) body.push(`            <beam xml:id="${item.id}${suffix}-beam">`);
          const indent = inBeam ? '              ' : '            ';
          if (fingering) {
            body.push(tabItemXml(item, fingering, indent));
          } else {
            const verse = item.kind === 'note' && !item.tiedFromPrevious ? (syllables.get(item.eventId) ?? '') : '';
            body.push(itemXml(item, accidentals, tiedIn, indent, verse));
          }
          if (beam && i === beam[1]) body.push('            </beam>');
          if (brackets.some((g) => g.end === i)) body.push('            </tuplet>');
        });
        body.push('          </layer>');
      });
      body.push('        </staff>');
    }
    for (const control of controls.get(m.number) ?? []) body.push(`        ${control}`);
    // Chord symbols sit above the top staff, at their beat inside the measure.
    for (const c of score.chords ?? []) {
      if (!le(m.start, c.at) || !lt(c.at, m.end)) continue;
      const beats = div(sub(c.at, m.gridStart), frac(1, m.sig.unit));
      body.push(`        <harm xml:id="harm-${m.number}-${c.at.n}-${c.at.d}" staff="${slots[0]!.n}" tstamp="${(beats.n / beats.d + 1).toFixed(4)}">${esc(c.text)}</harm>`);
    }
    body.push('      </measure>');
  });

  const first = measures[0]!;
  const composer = score.composer
    ? `<respStmt><persName role="composer">${esc(score.composer)}</persName></respStmt>`
    : '';
  const mei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead><fileDesc><titleStmt><title>${esc(score.title)}</title>${composer}</titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="${first.sig.count}" meter.unit="${first.sig.unit}" keysig="${keysigAttr(first.fifths)}">
${staffGrpXml(score, slots)}
    </scoreDef>
    <section>
${body.join('\n')}
    </section>
  </score></mdiv></body></music>
</mei>
`;
  return {
    mei,
    elements,
    tab: tabNotes,
    staffs: slots.filter((s) => !s.tab).map((s) => ({ n: s.n, partId: s.part.id, staffIndex: s.staffIndex })),
  };
}

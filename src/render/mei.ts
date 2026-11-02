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
import { type Score, type Part, measuresOf, type Measure, validateScore } from '../core/model';
import { getInstrument, type Clef } from '../core/instruments';
import { keyAlteration, type Pitch } from '../core/pitch';
import {
  beamGroups,
  notateVoice,
  type NotatedItem,
  type NotatedNote,
  type WrittenDuration,
} from '../core/notation/notate';

export interface ElementRef {
  readonly partId: string;
  readonly voiceId: string;
  /** Set for notes; rests have no model event. */
  readonly eventId?: string;
  readonly measureNumber: number;
}

export interface MeiResult {
  readonly mei: string;
  /** xml:id → model reference. */
  readonly elements: ReadonlyMap<string, ElementRef>;
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

function noteXml(item: NotatedNote, accidentals: AccidentalState, indent: string): string {
  const tie =
    item.tiedFromPrevious && item.tiedToNext ? 'm' : item.tiedToNext ? 'i' : item.tiedFromPrevious ? 't' : '';
  const tieAttr = tie ? ` tie="${tie}"` : '';
  const pitchAttrs = (p: Pitch) =>
    `pname="${p.step.toLowerCase()}" oct="${p.octave}"${accidentals.attrsFor(p, item.tiedFromPrevious)}`;

  if (item.pitches.length === 1) {
    return `${indent}<note xml:id="${item.id}" ${durAttrs(item.duration)} ${pitchAttrs(item.pitches[0]!)}${tieAttr}/>`;
  }
  const notes = item.pitches
    .map((p, i) => `${indent}  <note xml:id="${item.id}-${i + 1}" ${pitchAttrs(p)}${tieAttr}/>`)
    .join('\n');
  return `${indent}<chord xml:id="${item.id}" ${durAttrs(item.duration)}>\n${notes}\n${indent}</chord>`;
}

function itemXml(item: NotatedItem, accidentals: AccidentalState, indent: string): string {
  switch (item.kind) {
    case 'note':
      return noteXml(item, accidentals, indent);
    case 'rest':
      return `${indent}<rest xml:id="${item.id}" ${durAttrs(item.duration)}/>`;
    case 'measureRest':
      return `${indent}<mRest xml:id="${item.id}"/>`;
  }
}

interface StaffSlot {
  readonly n: number;
  readonly part: Part;
  readonly staffIndex: number;
}

function staffGrpXml(score: Score, slots: StaffSlot[]): string {
  const lines: string[] = ['      <staffGrp>'];
  for (const part of score.parts) {
    const def = getInstrument(part.instrument);
    const own = slots.filter((s) => s.part === part);
    const staffDef = (s: StaffSlot, withLabel: boolean, ind: string) =>
      `${ind}<staffDef n="${s.n}" lines="5" ${clefAttrs(def.staves[s.staffIndex]!.clef)}>` +
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

export function scoreToMei(score: Score): MeiResult {
  const problems = validateScore(score);
  if (problems.length > 0) throw new Error(`Partitur ungültig:\n- ${problems.join('\n- ')}`);

  const measures = measuresOf(score);
  const elements = new Map<string, ElementRef>();

  // Global staff numbering across all parts.
  const slots: StaffSlot[] = [];
  for (const part of score.parts) {
    getInstrument(part.instrument).staves.forEach((_, staffIndex) => {
      slots.push({ n: slots.length + 1, part, staffIndex });
    });
  }

  // Notate every voice once: voiceId → items per measure.
  const notated = new Map<string, NotatedItem[][]>();
  for (const part of score.parts) {
    for (const voice of part.voices) {
      const perMeasure = notateVoice(voice, measures);
      notated.set(voice.id, perMeasure);
      perMeasure.forEach((items, mi) => {
        for (const it of items) {
          const ref: ElementRef = {
            partId: part.id,
            voiceId: voice.id,
            measureNumber: measures[mi]!.number,
            ...(it.kind === 'note' ? { eventId: it.eventId } : {}),
          };
          elements.set(it.id, ref);
          if (it.kind === 'note' && it.pitches.length > 1) {
            it.pitches.forEach((_, i) => elements.set(`${it.id}-${i + 1}`, ref));
          }
        }
      });
    }
  }

  const body: string[] = [];
  measures.forEach((m, mi) => {
    const change = mi > 0 ? scoreDefChange(measures[mi - 1]!, m) : null;
    if (change) body.push(change);
    body.push(`      <measure xml:id="m${m.number}" n="${m.number}">`);
    for (const slot of slots) {
      body.push(`        <staff n="${slot.n}">`);
      const voices = slot.part.voices.filter((v) => v.staff === slot.staffIndex);
      const accidentals = new AccidentalState(m.fifths);
      if (voices.length === 0) {
        body.push(`          <layer n="1"><mRest/></layer>`);
      }
      voices.forEach((voice, li) => {
        body.push(`          <layer n="${li + 1}">`);
        const items = notated.get(voice.id)![mi]!;
        const beams = beamGroups(items, m);
        items.forEach((item, i) => {
          const beam = beams.find(([a, b]) => i >= a && i <= b);
          const inBeam = beam !== undefined;
          if (beam && i === beam[0]) body.push(`            <beam xml:id="${item.id}-beam">`);
          body.push(itemXml(item, accidentals, inBeam ? '              ' : '            '));
          if (beam && i === beam[1]) body.push('            </beam>');
        });
        body.push('          </layer>');
      });
      body.push('        </staff>');
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
  return { mei, elements };
}

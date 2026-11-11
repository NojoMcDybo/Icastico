/**
 * Icastico score → MusicXML 3.1 (score-partwise), so other programs (Finale, MuseScore, Dorico …) can read it.
 *
 * Written from the notation layer, not from the raw timeline: notes that cross barlines are already split
 * and tied, rests are filled in, tuplets are grouped – exactly what the engraving shows.
 *
 * Left out (reported): glides and loudness lines (MusicXML has no equivalent we write), and everything the
 * notation does not show. Chord symbols and lyrics are written (ADR 0019).
 */
import { type Fraction, add, eq, frac, le, lt, sub } from '../time';
import { type Pitch, spellMidi } from '../pitch';
import { getInstrument } from '../instruments';
import { type Measure, type Part, type Score, type Voice, DEFAULT_TEMPO, measuresOf, systemBreaks, validateScore } from '../model';
import {
  type NotatedItem,
  type NotatedNote,
  notateVoice,
  realValue,
  tupletGroups,
} from '../notation/notate';
import { KIND_TEXT } from '../import/musicxml';
import { MAX_VERSES, lyricOf } from '../lyrics';
import { barSign, noteSymbol, voltaNumber } from '../symbols';

const ARTICULATION_XML: Record<string, string> = { stacc: 'staccato', stacciss: 'staccatissimo', ten: 'tenuto', acc: 'accent', marc: 'strong-accent', breath: 'breath-mark', caesura: 'caesura' };
const ORNAMENT_XML: Record<string, string> = { trill: 'trill-mark', mord: 'mordent', prall: 'inverted-mordent', turn: 'turn' };

/** Index of the note where a crescendo / decrescendo starting at `k` ends: the next note with a dynamic, else the last note. */
function hairpinEnd(events: readonly { readonly marks?: readonly string[] }[], k: number): number {
  const next = events.findIndex((e, i) => i > k && e.marks?.some((m) => noteSymbol(m)?.group === 'dynamic'));
  return next >= 0 ? next : events.length - 1;
}

export interface ExportResult {
  readonly xml: string;
  /** German remarks about what could not be written. */
  readonly notes: readonly string[];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

const TYPE_NAMES: Record<number, string> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th' };

/** Divisions per quarter note such that every onset and duration of the score is a whole number of divisions. */
function divisionsFor(score: Score, measures: readonly Measure[]): number {
  let d = 1;
  const need = (t: Fraction) => {
    const q = frac(t.n * 4, t.d); // in quarter notes
    d = lcm(d, q.d);
  };
  for (const part of score.parts) for (const voice of part.voices) for (const e of voice.events) (need(e.onset), need(e.duration));
  for (const m of measures) (need(m.start), need(m.end));
  for (const c of score.chords ?? []) need(c.at);
  // Rests of tuplet gaps and split notes land on the same denominators; one more factor covers beat-aligned pieces.
  return d;
}

function pitchXml(p: Pitch, octaveShift: number): string {
  const alter = p.alter !== 0 ? `<alter>${p.alter}</alter>` : '';
  return `<pitch><step>${p.step}</step>${alter}<octave>${p.octave + octaveShift}</octave></pitch>`;
}

/** The tuning of a guitar or tablature part as MusicXML staff details: line 1 is the lowest string, pitches written like the notes. */
function staffDetailsXml(tuning: readonly number[], octaveShift: number): string {
  const strings = [...tuning].reverse().map((midi, i) => {
    const p = spellMidi(midi + 12 * octaveShift, 0);
    return `<staff-tuning line="${i + 1}"><tuning-step>${p.step}</tuning-step>${p.alter !== 0 ? `<tuning-alter>${p.alter}</tuning-alter>` : ''}<tuning-octave>${p.octave}</tuning-octave></staff-tuning>`;
  });
  return `<staff-details><staff-lines>${tuning.length}</staff-lines>${strings.join('')}</staff-details>`;
}

/** "Am7/G" → MusicXML <harmony>; null when the text does not start with a note name. */
function harmonyXml(text: string, offset: number): string | null {
  const slash = text.lastIndexOf('/');
  const main = slash > 0 ? text.slice(0, slash) : text;
  const bassText = slash > 0 ? text.slice(slash + 1) : '';
  const root = /^([A-G])([#b]{0,2})(.*)$/.exec(main);
  const bass = bassText ? /^([A-G])([#b]{0,2})$/.exec(bassText) : null;
  if (!root || (bassText && !bass)) return null;
  const alterOf = (s: string) => (s.startsWith('#') ? s.length : -s.length);
  const rootAlter = root[2] ? `<root-alter>${alterOf(root[2])}</root-alter>` : '';
  const suffix = root[3] ?? '';
  const known = Object.entries(KIND_TEXT).find(([, v]) => v === suffix && suffix !== '');
  const kind = suffix === '' ? '<kind>major</kind>' : known ? `<kind text="${esc(suffix)}">${known[0]}</kind>` : `<kind text="${esc(suffix)}">other</kind>`;
  const bassXml = bass ? `<bass><bass-step>${bass[1]}</bass-step>${bass[2] ? `<bass-alter>${alterOf(bass[2])}</bass-alter>` : ''}</bass>` : '';
  const off = offset > 0 ? `<offset>${offset}</offset>` : '';
  return `<harmony><root><root-step>${root[1]}</root-step>${rootAlter}</root>${kind}${bassXml}${off}</harmony>`;
}

function clefXml(number: number, sign: string, line: number, octave: number, many: boolean): string {
  return `<clef${many ? ` number="${number}"` : ''}><sign>${sign}</sign><line>${line}</line>${octave !== 0 ? `<clef-octave-change>${octave}</clef-octave-change>` : ''}</clef>`;
}

export function exportMusicXml(score: Score, appVersion = ''): ExportResult {
  const problems = validateScore(score);
  if (problems.length > 0) throw new Error(`Partitur ungültig:\n- ${problems.join('\n- ')}`);
  const notes: string[] = [];
  const lastChord = score.chords?.[score.chords.length - 1]?.at; // a chord symbol after the last note still needs its bar
  const measures = measuresOf(score, 1, lastChord);
  const divisions = divisionsFor(score, measures);
  const units = (t: Fraction): number => Math.round((t.n * 4 * divisions) / t.d);

  const lineBreaks = new Set(systemBreaks(score, measures.length));
  const links = score.links ?? [];
  const tieOut = new Set(links.filter((l) => l.kind === 'tie').map((l) => l.from));
  const tieIn = new Set(links.filter((l) => l.kind === 'tie').map((l) => l.to));
  const slides = links.filter((l) => l.kind === 'slide').length;
  if (slides > 0) notes.push(`Gleiten: ${slides}× nicht geschrieben (MusicXML kennt es nicht in dieser Form).`);
  if (score.parts.some((p) => p.voices.some((v) => v.events.some((e) => e.tones.some((t) => t.volume !== undefined || t.curve))))) {
    notes.push('Lautstärke und Lautstärkelinien sind nicht in der Datei.');
  }
  if (links.some((l) => l.curve)) notes.push('Gleit-Verläufe sind nicht in der Datei.');
  if (score.parts.some((p) => p.instrument === 'tab')) notes.push('Tabulaturzeilen sind als Notenzeile (Gitarre) geschrieben, ohne Bundzahlen.');

  // Brackets and braces around parts: a part-group opens before its first part and closes after its last.
  const groupNumber = new Map<string, number>();
  (score.groups ?? []).forEach((g, k) => g.parts.forEach((id) => groupNumber.set(id, k + 1)));
  const partList = score.parts
    .flatMap((p, i) => {
      const g = (score.groups ?? []).find((x) => x.parts.includes(p.id));
      const n = groupNumber.get(p.id);
      return [
        ...(g && g.parts[0] === p.id ? [`    <part-group type="start" number="${n}"><group-symbol>${g.symbol}</group-symbol><group-barline>yes</group-barline></part-group>`] : []),
        `    <score-part id="P${i + 1}"><part-name>${esc(p.name)}</part-name></score-part>`,
        ...(g && g.parts[g.parts.length - 1] === p.id ? [`    <part-group type="stop" number="${n}"/>`] : []),
      ];
    })
    .join('\n');
  const partXml = score.parts.map((part, pi) => partToXml(part, pi));

  function partToXml(part: Part, partIndex: number): string {
    const def = getInstrument(part.instrument);
    const manyStaves = def.staves.length > 1;
    // Voices to write: per staff those with notes, or the first one if the staff is empty.
    const voices: Voice[] = [];
    def.staves.forEach((_, staffIndex) => {
      const onStaff = part.voices.filter((v) => v.staff === staffIndex);
      voices.push(...(onStaff.some((v) => v.events.length > 0) ? onStaff.filter((v) => v.events.length > 0) : onStaff.slice(0, 1)));
    });
    const notated = new Map(voices.map((v) => [v.id, notateVoice(v, measures)]));
    const out: string[] = [`  <part id="P${partIndex + 1}">`];
    // Lyrics: "-" at the end of a syllable continues the word.
    const continues = new Map<string, boolean>();

    measures.forEach((m, mi) => {
      const prev = measures[mi - 1];
      const length = units(sub(m.end, m.start));
      out.push(`    <measure number="${m.number}"${m.number === 0 ? ' implicit="yes"' : ''}>`);
      if (partIndex === 0 && lineBreaks.has(mi)) out.push('      <print new-system="yes"/>');
      const attrs: string[] = [];
      if (mi === 0) attrs.push(`<divisions>${divisions}</divisions>`);
      if (!prev || prev.fifths !== m.fifths) attrs.push(`<key><fifths>${m.fifths}</fifths></key>`);
      if (!prev || prev.sig.count !== m.sig.count || prev.sig.unit !== m.sig.unit) attrs.push(`<time><beats>${m.sig.count}</beats><beat-type>${m.sig.unit}</beat-type></time>`);
      if (mi === 0) {
        if (manyStaves) attrs.push(`<staves>${def.staves.length}</staves>`);
        def.staves.forEach((st, i) => attrs.push(clefXml(i + 1, st.clef.shape, st.clef.line, st.clef.octave, manyStaves)));
        if (part.tuning && (part.instrument === 'guitar' || part.instrument === 'tab')) attrs.push(staffDetailsXml(part.tuning, -def.staves[0]!.clef.octave));
      }
      const kinds = (score.marks ?? []).filter((b) => le(m.start, b.at) && lt(b.at, m.end)).map((b) => b.kind as string);
      const volta = Math.max(0, ...kinds.map(voltaNumber));
      const prevVolta = mi > 0 ? Math.max(0, ...(score.marks ?? []).filter((b) => le(measures[mi - 1]!.start, b.at) && lt(b.at, measures[mi - 1]!.end)).map((b) => voltaNumber(b.kind))) : 0;
      const nextVolta = measures[mi + 1] ? Math.max(0, ...(score.marks ?? []).filter((b) => le(measures[mi + 1]!.start, b.at) && lt(b.at, measures[mi + 1]!.end)).map((b) => voltaNumber(b.kind))) : 0;
      const leftBar = [
        kinds.includes('repeatStart') ? '<bar-style>heavy-light</bar-style>' : '',
        volta && volta !== prevVolta ? `<ending number="${volta}" type="start"/>` : '',
        kinds.includes('repeatStart') ? '<repeat direction="forward"/>' : '',
      ].join('');
      if (leftBar) out.push(`      <barline location="left">${leftBar}</barline>`);
      if (attrs.length) out.push(`      <attributes>${attrs.join('')}</attributes>`);
      if (partIndex === 0) {
        const staff = manyStaves ? '<staff>1</staff>' : '';
        for (const kind of kinds) {
          const sign = barSign(kind);
          if (kind === 'segno') out.push(`      <direction placement="above"><direction-type><segno/></direction-type>${staff}<sound segno="segno"/></direction>`);
          else if (kind === 'coda') out.push(`      <direction placement="above"><direction-type><coda/></direction-type>${staff}<sound coda="coda"/></direction>`);
          else if (sign?.text) out.push(`      <direction placement="above"><direction-type><words>${esc(sign.text)}</words></direction-type>${staff}</direction>`);
        }
      }
      const change = (score.tempos ?? []).find((c) => eq(c.at, m.start));
      if (partIndex === 0 && (mi === 0 || change)) {
        const bpm = mi === 0 ? (score.tempo ?? DEFAULT_TEMPO) : change!.bpm;
        out.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`);
      }

      voices.forEach((voice, vi) => {
        if (vi > 0) out.push(`      <backup><duration>${length}</duration></backup>`);
        const items = notated.get(voice.id)![mi]!;
        const brackets = tupletGroups(items);
        const staffTag = manyStaves ? `<staff>${voice.staff + 1}</staff>` : '';
        const octaveShift = -def.staves[voice.staff]!.clef.octave; // guitar is written an octave above its sound
        // Chord symbols are written once, in the first voice of the first part, before the item they fall into.
        const harmonies = partIndex === 0 && vi === 0 ? (score.chords ?? []).filter((c) => le(m.start, c.at) && lt(c.at, m.end)) : [];
        const written = new Set<string>();
        // Where a crescendo / decrescendo ends (MusicXML wants the stop written where it happens).
        const wedgeStops = new Set<string>();
        voice.events.forEach((e, k) => {
          if (e.marks?.some((x) => x === 'cresc' || x === 'dim')) wedgeStops.add(voice.events[hairpinEnd(voice.events, k)]!.id);
        });

        // A slur sign on a note: the slur starts on its last drawn piece and stops on the first piece of the next note.
        const slurs = { start: new Set<string>(), stop: new Set<string>() };
        voice.events.forEach((e, k) => {
          const to = voice.events[k + 1];
          if (to && e.marks?.includes('slur')) {
            slurs.start.add(e.id);
            slurs.stop.add(to.id);
          }
        });

        items.forEach((item, i) => {
          const start = item.kind === 'measureRest' ? m.start : item.onset;
          const real = item.kind === 'measureRest' ? sub(m.end, m.start) : realValue(item.duration, item.tuplet);
          const next = add(start, real);
          for (const c of harmonies) {
            const key = `${c.at.n}/${c.at.d}`;
            if (written.has(key) || !(le(start, c.at) && lt(c.at, next))) continue;
            written.add(key);
            const xml = harmonyXml(c.text, units(sub(c.at, start))) ?? `<direction><direction-type><words>${esc(c.text)}</words></direction-type></direction>`;
            out.push(`      ${xml}`);
          }
          out.push(...itemToXml(item, i, brackets, vi + 1, staffTag, octaveShift, voice, continues, units, length, tieOut, tieIn, wedgeStops, slurs).map((l) => `      ${l}`));
        });
      });
      const rightBar = [
        kinds.includes('repeatEnd') || kinds.includes('finalBar') ? '<bar-style>light-heavy</bar-style>' : kinds.includes('doubleBar') ? '<bar-style>light-light</bar-style>' : '',
        volta && volta !== nextVolta ? `<ending number="${volta}" type="${kinds.includes('repeatEnd') ? 'stop' : 'discontinue'}"/>` : '',
        kinds.includes('repeatEnd') ? '<repeat direction="backward"/>' : '',
      ].join('');
      if (rightBar) out.push(`      <barline location="right">${rightBar}</barline>`);
      out.push('    </measure>');
    });
    out.push('  </part>');
    return out.join('\n');
  }

  const composer = score.composer ? `<creator type="composer">${esc(score.composer)}</creator>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${esc(score.title)}</work-title></work>
  <identification>${composer}<encoding><software>Icastico${appVersion ? ` ${esc(appVersion)}` : ''}</software></encoding></identification>
  <part-list>
${partList}
  </part-list>
${partXml.join('\n')}
</score-partwise>
`;
  return { xml, notes };
}

function itemToXml(
  item: NotatedItem,
  index: number,
  brackets: ReturnType<typeof tupletGroups>,
  voiceNo: number,
  staffTag: string,
  octaveShift: number,
  voice: Voice,
  continues: Map<string, boolean>,
  units: (t: Fraction) => number,
  measureUnits: number,
  tieOut: ReadonlySet<string>,
  tieIn: ReadonlySet<string>,
  wedgeStops: ReadonlySet<string>,
  slurs: { readonly start: ReadonlySet<string>; readonly stop: ReadonlySet<string> },
): string[] {
  if (item.kind === 'measureRest') {
    return [`<note><rest measure="yes"/><duration>${measureUnits}</duration><voice>${voiceNo}</voice>${staffTag}</note>`];
  }
  const duration = units(realValue(item.duration, item.tuplet));
  const type = `<type>${TYPE_NAMES[item.duration.base]}</type>${'<dot/>'.repeat(item.duration.dots)}`;
  const modification = item.tuplet ? `<time-modification><actual-notes>${item.tuplet.num}</actual-notes><normal-notes>${item.tuplet.numbase}</normal-notes></time-modification>` : '';
  const bracket = brackets.find((g) => g.start === index);
  const bracketEnd = brackets.some((g) => g.end === index);

  if (item.kind === 'rest') {
    const tuplet = tupletNotation(bracket !== undefined, bracketEnd);
    return [`<note><rest/><duration>${duration}</duration><voice>${voiceNo}</voice>${type}${modification}${staffTag}${tuplet}</note>`];
  }
  const lyric = !item.tiedFromPrevious ? lyricXml(voice, item, continues) : '';
  const event = item.tiedFromPrevious ? undefined : voice.events.find((e) => e.id === item.eventId);
  const signs = event?.marks ?? [];
  const staffNo = staffTag.replace('<staff>', '').replace('</staff>', '');
  const direction = (type: string, placement: string) => `<direction placement="${placement}"><direction-type>${type}</direction-type>${staffTag ? `<staff>${staffNo}</staff>` : ''}</direction>`;
  const before: string[] = [];
  if (!item.tiedFromPrevious && wedgeStops.has(item.eventId)) before.push(direction('<wedge type="stop"/>', 'below'));
  for (const sign of signs) {
    if (noteSymbol(sign)?.group === 'dynamic') before.push(direction(`<dynamics><${sign}/></dynamics>`, 'below'));
    else if (sign === 'cresc') before.push(direction('<wedge type="crescendo"/>', 'below'));
    else if (sign === 'dim') before.push(direction('<wedge type="diminuendo"/>', 'below'));
  }
  const slurXml = `${!item.tiedFromPrevious && slurs.stop.has(item.eventId) ? '<slur type="stop" number="1"/>' : ''}${!item.tiedToNext && slurs.start.has(item.eventId) ? '<slur type="start" number="1"/>' : ''}`;
  const notationSigns = slurXml + signs
    .map((sign) => (ARTICULATION_XML[sign] ? `<articulations><${ARTICULATION_XML[sign]}/></articulations>` : ORNAMENT_XML[sign] ? `<ornaments><${ORNAMENT_XML[sign]}/></ornaments>` : sign === 'fermata' ? '<fermata/>' : sign === 'arpeggio' ? '<arpeggiate/>' : ''))
    .join('');
  return [...before, ...item.tones.map((tone, ti) => {
    const stop = item.tiedFromPrevious || tieIn.has(tone.id);
    const start = item.tiedToNext || tieOut.has(tone.id);
    const ties = `${stop ? '<tie type="stop"/>' : ''}${start ? '<tie type="start"/>' : ''}`;
    const tied = `${stop ? '<tied type="stop"/>' : ''}${start ? '<tied type="start"/>' : ''}`;
    const tuplet = tupletNotation(ti === 0 && bracket !== undefined, ti === 0 && bracketEnd, tied + (ti === 0 ? notationSigns : ''));
    return `<note>${ti > 0 ? '<chord/>' : ''}${pitchXml(tone.pitch, octaveShift)}<duration>${duration}</duration>${ties}<voice>${voiceNo}</voice>${type}${modification}${staffTag}${tuplet}${ti === 0 ? lyric : ''}</note>`;
  })];
}

function tupletNotation(start: boolean, stop: boolean, tied = ''): string {
  const inner = `${tied}${stop ? '<tuplet type="stop"/>' : ''}${start ? '<tuplet type="start"/>' : ''}`;
  return inner ? `<notations>${inner}</notations>` : '';
}

function lyricXml(voice: Voice, item: NotatedNote, continues: Map<string, boolean>): string {
  const event = voice.events.find((e) => e.id === item.eventId);
  if (!event) return '';
  let xml = '';
  for (let verse = 1; verse <= MAX_VERSES; verse++) {
    const syllable = lyricOf(event, verse);
    if (syllable === undefined) continue;
    const goesOn = syllable.endsWith('-');
    const text = (goesOn ? syllable.slice(0, -1) : syllable).replace(/_/g, ' ');
    const key = `${voice.id}:${verse}`;
    const was = continues.get(key) ?? false;
    const syllabic = goesOn ? (was ? 'middle' : 'begin') : was ? 'end' : 'single';
    continues.set(key, goesOn);
    xml += `<lyric number="${verse}"><syllabic>${syllabic}</syllabic><text>${esc(text)}</text></lyric>`;
  }
  return xml;
}

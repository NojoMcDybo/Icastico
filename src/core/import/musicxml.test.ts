import { beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { musicXmlText } from './container';
import { frac } from '../time';
import { pitchToString } from '../pitch';
import { validateScore } from '../model';
import { serializeScore, parseScoreFile } from '../file/format';
import { scoreToMei } from '../../render/mei';
import { Engraver } from '../../render/verovio';
import { ImportError, importMusicXml } from './musicxml';
import { XmlError, parseXml } from './xml';

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`;

const part = (id: string, body: string) => `<part id="${id}">${body}</part>`;
const doc = (parts: { id: string; name: string; xml: string; extra?: string }[], extra = '') => `${HEAD}
<score-partwise version="3.1">
  <work><work-title>Übung &amp; Lied</work-title></work>
  <identification><creator type="composer">J. Beispiel</creator></identification>
  <part-list>${parts.map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name>${p.extra ?? ''}</score-part>`).join('')}</part-list>
  ${extra}
  ${parts.map((p) => part(p.id, p.xml)).join('\n')}
</score-partwise>`;

const note = (step: string, octave: number, duration: number, more = '') =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${more}</note>`;
const rest = (duration: number) => `<note><rest/><duration>${duration}</duration></note>`;

const attrs = (extra = '') =>
  `<attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${extra}</attributes>`;

/** Upbeat of one quarter, then bar 1: chord C-E-G half + tied G half, bar 2: rest, D quarter. */
const MELODY = doc([
  {
    id: 'P1',
    name: 'Gesang',
    xml: `
    <measure number="0" implicit="yes">${attrs()}<direction><sound tempo="120"/></direction>${note('D', 5, 2)}</measure>
    <measure number="1">
      ${note('C', 5, 4)}${note('E', 5, 4, '<chord/>')}${note('G', 4, 4, '<chord/>')}
      ${note('G', 4, 4, '<tie type="start"/>')}
    </measure>
    <measure number="2">
      ${note('G', 4, 2, '<tie type="stop"/>')}${rest(2)}${note('F', 5, 4, '<notations><tied type="stop"/></notations>')}
    </measure>`,
  },
]);

describe('XML reader', () => {
  it('reads elements, attributes, entities, CDATA and skips comments and the doctype', () => {
    const root = parseXml(`<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><!-- c --><a id="1" t='2'><b>x &amp; &#65;&#x42;</b><c/><d><![CDATA[<z>]]></d></a>`);
    expect(root.attrs).toEqual({ id: '1', t: '2' });
    expect(root.children.map((c) => c.name)).toEqual(['b', 'c', 'd']);
    expect(root.children[0]!.text).toBe('x & AB');
    expect(root.children[2]!.text).toBe('<z>');
  });

  it('rejects broken documents', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(XmlError);
    expect(() => parseXml('<a>')).toThrow(/nicht geschlossen/);
    expect(() => parseXml('')).toThrow(XmlError);
  });
});

describe('MusicXML import', () => {
  const { score, notes } = importMusicXml(MELODY, 'lied.musicxml');

  it('takes title, composer, key, meter, tempo and the upbeat', () => {
    expect(score.title).toBe('Übung & Lied');
    expect(score.composer).toBe('J. Beispiel');
    expect(score.keys).toEqual([{ at: frac(0), fifths: 1 }]);
    expect(score.meter).toEqual([{ at: frac(0), sig: { count: 4, unit: 4 } }]);
    expect(score.pickup).toEqual(frac(1, 4));
    expect(score.tempo).toBe(120);
    expect(validateScore(score)).toEqual([]);
  });

  it('makes one voice with notes, a chord, a rest as gap and the right times', () => {
    expect(score.parts).toHaveLength(1);
    expect(score.parts[0]).toMatchObject({ name: 'Gesang', instrument: 'voice' });
    const events = score.parts[0]!.voices[0]!.events;
    expect(events.map((e) => [e.onset, e.duration, e.tones.map((t) => pitchToString(t.pitch)).join('+')])).toEqual([
      [frac(0), frac(1, 4), 'D5'],
      [frac(1, 4), frac(1, 2), 'G4+C5+E5'],
      [frac(3, 4), frac(1, 2), 'G4'],
      [frac(5, 4), frac(1, 4), 'G4'],
      [frac(7, 4), frac(1, 2), 'F5'],
    ].map(([onset, duration, names]) => [onset, duration, names]) as never);
  });

  it('turns ties into explicit links, also over the barline', () => {
    const events = score.parts[0]!.voices[0]!.events;
    expect(score.links).toEqual([{ id: 'link-1', kind: 'tie', from: events[2]!.tones[0]!.id, to: events[3]!.tones[0]!.id }]);
  });

  it('saves and loads like any score', () => {
    expect(parseScoreFile(serializeScore(score, '0.0.0'))).toEqual(score);
    expect(notes).toEqual([]);
  });
});

describe('MusicXML import: piano, voices, guitar, tuplets, leftovers', () => {
  it('two staves become a piano; backup makes a second voice on the same staff', () => {
    const xml = doc([
      {
        id: 'P1',
        name: 'Klavier',
        xml: `<measure number="1">${attrs('<staves>2</staves>')}
          ${note('C', 5, 4, '<voice>1</voice><staff>1</staff>')}${note('D', 5, 4, '<voice>1</voice><staff>1</staff>')}
          <backup><duration>8</duration></backup>
          ${note('E', 4, 8, '<voice>2</voice><staff>1</staff>')}
          <backup><duration>8</duration></backup>
          ${note('C', 3, 8, '<voice>5</voice><staff>2</staff>')}
        </measure>`,
      },
    ]);
    const { score } = importMusicXml(xml);
    const p = score.parts[0]!;
    expect(p.instrument).toBe('piano');
    expect(p.voices.map((v) => [v.staff, v.events.length])).toEqual([[0, 2], [0, 1], [1, 1]]);
    expect(validateScore(score)).toEqual([]);
  });

  it('overlapping notes of one voice go to an extra voice and are reported', () => {
    const xml = doc([{ id: 'P1', name: 'Gesang', xml: `<measure number="1">${attrs()}${note('C', 5, 8)}<backup><duration>6</duration></backup>${note('E', 5, 4)}</measure>` }]);
    const { score, notes } = importMusicXml(xml);
    expect(score.parts[0]!.voices.filter((v) => v.events.length)).toHaveLength(2);
    expect(notes.join(' ')).toMatch(/überlappen/);
  });

  it('a guitar is written an octave above sound; a transpose element is applied as given', () => {
    const plain = importMusicXml(doc([{ id: 'P1', name: 'Gitarre', xml: `<measure number="1">${attrs()}${note('E', 4, 8)}</measure>` }])).score;
    expect(plain.parts[0]!.instrument).toBe('guitar');
    expect(pitchToString(plain.parts[0]!.voices[0]!.events[0]!.tones[0]!.pitch)).toBe('E3');
    const transposed = importMusicXml(
      doc([{ id: 'P1', name: 'Gitarre', xml: `<measure number="1">${attrs('<transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>')}${note('E', 4, 8)}</measure>` }]),
    ).score;
    expect(pitchToString(transposed.parts[0]!.voices[0]!.events[0]!.tones[0]!.pitch)).toBe('E3');
    const clarinet = importMusicXml(
      doc([{ id: 'P1', name: 'Klarinette', xml: `<measure number="1">${attrs('<transpose><chromatic>-2</chromatic></transpose>')}${note('D', 5, 8)}</measure>` }]),
    );
    expect(pitchToString(clarinet.score.parts[0]!.voices[0]!.events[0]!.tones[0]!.pitch)).toBe('C5'); // sounds a tone lower
    expect(clarinet.notes.join(' ')).toMatch(/Klarinette/);
  });

  it('rounds tuplet notes to the 1/32 grid (no N-tuplets yet), keeps the bar whole and says what it left out', () => {
    const third = `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>`;
    const xml = doc([
      {
        id: 'P1',
        name: 'Gesang',
        xml: `<measure number="1">${attrs().replace('<divisions>2', '<divisions>3')}
          <harmony><root><root-step>C</root-step></root></harmony>
          <note><grace/><pitch><step>B</step><octave>4</octave></pitch></note>
          ${note('C', 5, 1, third)}${note('D', 5, 1, third)}${note('E', 5, 1, third)}${rest(5)}
          <note><pitch><step>C</step><octave>5</octave></pitch><duration>3</duration><lyric><text>la</text></lyric></note>
        </measure>`,
      },
    ]);
    const { score, notes } = importMusicXml(xml);
    const triplet = score.parts[0]!.voices[0]!.events.slice(0, 3);
    expect(triplet.map((e) => e.duration)).toEqual([frac(3, 32), frac(1, 16), frac(3, 32)]);
    expect(triplet[2]!.onset.n / triplet[2]!.onset.d + 3 / 32).toBeCloseTo(1 / 4, 10); // the triplet still fills a quarter
    expect(validateScore(score)).toEqual([]);
    const text = notes.join('\n');
    expect(text).toMatch(/Vorschlagsnoten: 1×/);
    expect(text).toMatch(/Akkordsymbole: 1×/);
    expect(text).toMatch(/Liedtext: 1×/);
    expect(text).toMatch(/\d Noten .*gerundet/);
  });

  it('meter changes at a barline and several parts share the structure', () => {
    const xml = doc([
      { id: 'P1', name: 'Gesang', xml: `<measure number="1">${attrs()}${note('C', 5, 8)}</measure><measure number="2"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note('D', 5, 6)}</measure>` },
      { id: 'P2', name: 'Klavier', xml: `<measure number="1">${attrs()}${note('C', 3, 8)}</measure><measure number="2">${note('G', 3, 6)}</measure>` },
    ]);
    const { score } = importMusicXml(xml);
    expect(score.meter).toEqual([
      { at: frac(0), sig: { count: 4, unit: 4 } },
      { at: frac(1), sig: { count: 3, unit: 4 } },
    ]);
    expect(score.parts.map((p) => p.id)).toEqual(['P1', 'P2']);
    expect(score.parts[1]!.voices[0]!.events[1]!.onset).toEqual(frac(1));
    expect(validateScore(score)).toEqual([]);
  });

  it('refuses things that are not a partwise MusicXML score, with a clear message', () => {
    expect(() => importMusicXml('hallo')).toThrow(ImportError);
    expect(() => importMusicXml('<html/>')).toThrow(/keine MusicXML-Partitur/);
    expect(() => importMusicXml('<score-timewise/>')).toThrow(/timewise/);
    expect(() => importMusicXml(`${HEAD}<score-partwise><part-list/></score-partwise>`)).toThrow(/keine Instrumente/);
  });
});

describe('an imported score engraves', () => {
  let engraver: Engraver;
  beforeAll(async () => {
    engraver = await Engraver.create();
  });

  it('with Verovio, without errors – including ties, chords, a second voice and tuplet times', () => {
    const third = `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>`;
    const xml = doc([
      {
        id: 'P1',
        name: 'Klavier',
        xml: `<measure number="1">${attrs('<staves>2</staves>').replace('<divisions>2', '<divisions>3')}
          ${note('C', 5, 2, `<voice>1</voice><staff>1</staff>${third}`)}${note('D', 5, 2, `<voice>1</voice><staff>1</staff>${third}`)}${note('E', 5, 2, `<voice>1</voice><staff>1</staff>${third}`)}${note('G', 5, 6, '<voice>1</voice><staff>1</staff><tie type="start"/>')}
          <backup><duration>12</duration></backup>
          ${note('E', 4, 12, '<voice>2</voice><staff>1</staff>')}
          <backup><duration>12</duration></backup>
          ${note('C', 3, 12, '<voice>3</voice><staff>2</staff>')}
        </measure><measure number="2">${note('G', 5, 12, '<voice>1</voice><staff>1</staff><tie type="stop"/>')}</measure>`,
      },
    ]);
    const { score } = importMusicXml(xml);
    const { pages, log } = engraver.engrave(scoreToMei(score).mei);
    expect(pages.length).toBeGreaterThan(0);
    expect(log).not.toMatch(/error/i);
  });
});

describe('compressed .mxl files', () => {
  it('unpacks the file named in container.xml and imports it', () => {
    const files = {
      'META-INF/container.xml': strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="Lied.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),
      'Lied.xml': strToU8(MELODY),
    };
    const text = musicXmlText(zipSync(files));
    expect(importMusicXml(text).score.title).toBe('Übung & Lied');
  });

  it('falls back to the first xml file; plain text and UTF-16 pass through; broken zips say so', () => {
    expect(importMusicXml(musicXmlText(zipSync({ 'a.musicxml': strToU8(MELODY) }))).score.parts).toHaveLength(1);
    expect(importMusicXml(musicXmlText(new TextEncoder().encode(MELODY))).score.parts).toHaveLength(1);
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...MELODY].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])]);
    expect(importMusicXml(musicXmlText(utf16)).score.title).toBe('Übung & Lied');
    expect(() => musicXmlText(zipSync({ 'x.txt': strToU8('nichts') }))).toThrow(/keine Partitur/);
    expect(() => musicXmlText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(/entpacken/);
  });
});

/**
 * The order in which the bars are played (ADR 0024): repeats, endings (1./2./3. Klammer), segno, coda and
 * D.C. / D.S. jumps turn the written bars into a longer or shorter run of music. This module only works out
 * the order and, for playback, a copy of the score with that order laid out on one timeline.
 *
 * Rules: a repeat plays twice; a bar with an ending bracket is played only in the pass of its number
 * (after a D.C./D.S. only in the last ending); a D.C. jumps to the start, a D.S. to the segno (or the start
 * if there is none); after a jump repeats are not taken again, "Fine" ends the piece and "To Coda" jumps to
 * the coda.
 */
import { type Fraction, ZERO, add, compare, eq, le, lt, sub } from './time';
import { type Score, measuresOf, setTempoChange, tempoAt, withTempo } from './model';
import { isJumpBack, voltaNumber } from './symbols';

/** The written time [from, to) is played at [from + offset, to + offset). */
export interface Segment {
  readonly from: Fraction;
  readonly to: Fraction;
  readonly offset: Fraction;
}

const ORDER_KINDS = new Set(['repeatStart', 'repeatEnd', 'volta1', 'volta2', 'volta3', 'toCoda', 'fine', 'dc', 'dcFine', 'dcCoda', 'ds', 'dsFine', 'dsCoda']);

/** The play order as segments, or null when the bars simply follow each other. */
export function playOrder(score: Score): Segment[] | null {
  if (!(score.marks ?? []).some((m) => ORDER_KINDS.has(m.kind))) return null;
  const measures = measuresOf(score);
  const kinds = measures.map((m) => (score.marks ?? []).filter((b) => le(m.start, b.at) && lt(b.at, m.end)).map((b) => b.kind as string));
  const has = (i: number, kind: string) => kinds[i]!.includes(kind);
  const volta = (i: number) => Math.max(0, ...kinds[i]!.map(voltaNumber));
  const lastVolta = Math.max(0, ...kinds.map((_, i) => volta(i)));
  const segno = Math.max(0, kinds.findIndex((_, i) => has(i, 'segno')));
  const coda = kinds.findIndex((_, i) => has(i, 'coda'));

  const order: number[] = [];
  let i = 0;
  let pass = 1;
  let jumped = false;
  let repeatFrom = 0;
  for (let guard = 0; i < measures.length && guard < measures.length * 6 + 50; guard++) {
    const v = volta(i);
    if (v && v !== (jumped ? lastVolta : pass)) {
      i++;
      continue;
    }
    if (has(i, 'repeatStart')) repeatFrom = i;
    order.push(i);
    if (jumped && has(i, 'fine')) break;
    if (jumped && has(i, 'toCoda') && coda > i) {
      i = coda;
      continue;
    }
    if (!jumped && has(i, 'repeatEnd')) {
      if (pass < 2) {
        pass++;
        i = repeatFrom;
        continue;
      }
      pass = 1;
      repeatFrom = i + 1;
    }
    if (!jumped && kinds[i]!.some(isJumpBack)) {
      jumped = true;
      pass = 1;
      i = kinds[i]!.some((k) => k.startsWith('ds')) ? segno : 0;
      continue;
    }
    i++;
  }

  // Neighbouring bars that follow each other in the written music form one stretch.
  const runs: { a: number; b: number }[] = [];
  for (const m of order) {
    const last = runs[runs.length - 1];
    if (last && last.b + 1 === m) last.b = m;
    else runs.push({ a: m, b: m });
  }
  const segments: Segment[] = [];
  let cursor = ZERO;
  for (const r of runs) {
    const from = measures[r.a]!.start;
    const to = measures[r.b]!.end;
    segments.push({ from, to, offset: sub(cursor, from) });
    cursor = add(cursor, sub(to, from));
  }
  return segments;
}

export interface PlayMap {
  /** The score to play: the written one, or a copy with the bars in play order. */
  readonly score: Score;
  /** Written time → where it is played first (a skipped bar maps to the next played one). */
  fromScore(t: Fraction): Fraction;
  /** Time in the played score → the written time it shows. */
  toScore(t: Fraction): Fraction;
}

export function playMapOf(score: Score): PlayMap {
  const segments = playOrder(score);
  if (!segments) return { score, fromScore: (t) => t, toScore: (t) => t };

  const copies = segments.map((_, k) => `~${k + 1}`);
  const parts = score.parts.map((part) => ({
    ...part,
    voices: part.voices.map((voice) => ({
      ...voice,
      events: segments.flatMap((seg, k) =>
        voice.events
          .filter((e) => le(seg.from, e.onset) && lt(e.onset, seg.to))
          .map((e) => {
            const end = add(e.onset, e.duration);
            const duration = lt(seg.to, end) ? sub(seg.to, e.onset) : e.duration;
            return {
              ...e,
              id: `${e.id}${copies[k]}`,
              onset: add(e.onset, seg.offset),
              duration,
              tones: e.tones.map((t) => ({ ...t, id: `${t.id}${copies[k]}` })),
            };
          }),
      ),
    })),
  }));
  const links = segments.flatMap((seg, k) => {
    const inside = new Set<string>();
    for (const part of score.parts) for (const v of part.voices) for (const e of v.events) if (le(seg.from, e.onset) && lt(e.onset, seg.to)) for (const t of e.tones) inside.add(t.id);
    return (score.links ?? []).filter((l) => inside.has(l.from) && inside.has(l.to)).map((l) => ({ ...l, id: `${l.id}${copies[k]}`, from: `${l.from}${copies[k]}`, to: `${l.to}${copies[k]}` }));
  });
  const { links: _links, tempos: _tempos, ...rest } = score;
  let unrolled: Score = withTempo({ ...rest, parts, ...(links.length ? { links } : {}) }, tempoAt(score, segments[0]!.from));
  // The tempo of each stretch (it may differ from the one the stretch before it ended with) and every change inside it, moved to play time.
  for (const seg of segments) {
    unrolled = setTempoChange(unrolled, add(seg.from, seg.offset), tempoAt(score, seg.from));
    for (const c of score.tempos ?? []) if (lt(seg.from, c.at) && lt(c.at, seg.to)) unrolled = setTempoChange(unrolled, add(c.at, seg.offset), c.bpm);
  }

  return {
    score: unrolled,
    fromScore: (t) => {
      const seg = segments.find((s) => le(s.from, t) && lt(t, s.to)) ?? segments.find((s) => compare(s.from, t) > 0) ?? segments[segments.length - 1]!;
      return add(le(seg.from, t) && lt(t, seg.to) ? t : seg.from, seg.offset);
    },
    toScore: (u) => {
      const seg = segments.find((s) => le(add(s.from, s.offset), u) && lt(u, add(s.to, s.offset)));
      if (seg) return sub(u, seg.offset);
      const last = segments[segments.length - 1]!;
      return eq(u, ZERO) ? segments[0]!.from : last.to;
    },
  };
}

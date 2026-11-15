/**
 * Equally wide bars (ADR 0046). Verovio spreads every Akkolade on its own, so the barlines of Akkoladen with the same
 * number of bars end up at different places. Here the finished drawing of such Akkoladen is re-spaced: the barlines of
 * all of them go to the same places and the music between them is stretched or squeezed to match.
 *
 * Only horizontal positions change. Everything that has a fixed shape (note, chord, rest, text, clef, …) is moved as a
 * whole – a stem must stay at its notehead – and only lines and curves (staff lines, barlines, ties, slurs, hairpins, beams)
 * get their end points moved one by one.
 */

interface Tag {
  readonly index: number;
  readonly end: number;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly name: string;
  readonly attrs: string;
}

const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g;
const NUMBER = String.raw`-?\d+(?:\.\d+)?`;

function tagsOf(svg: string, from: number, to: number): Tag[] {
  const out: Tag[] = [];
  TAG.lastIndex = from;
  for (let m = TAG.exec(svg); m && m.index < to; m = TAG.exec(svg)) {
    out.push({ index: m.index, end: m.index + m[0].length, closing: m[1] === '/', selfClosing: m[4] === '/', name: m[2]!, attrs: m[3]! });
  }
  return out;
}

const classOf = (attrs: string): string => / class="([^"]*)"/.exec(attrs)?.[1]?.split(' ')[0] ?? '';

/** Groups that only hold other things (or lines and curves): they are not moved as a whole, their parts are. */
const CONTAINERS = new Set([
  'system', 'section', 'measure', 'staff', 'layer', 'beam', 'tuplet', 'graceGrp', 'barLine', 'ledgerLines', 'tie', 'slur', 'hairpin',
  'tupletBracket', 'bracketSpan', 'ending', 'phrase', 'lv', 'grpSym', 'label', 'sb', 'pb', 'tabGrp', 'systemMilestoneEnd',
]);

/** Index of the tag that closes the element opened at `tags[i]`. */
function closeOf(tags: readonly Tag[], i: number): number {
  let depth = 0;
  for (let j = i; j < tags.length; j++) {
    const t = tags[j]!;
    if (t.selfClosing) continue;
    depth += t.closing ? -1 : 1;
    if (depth === 0) return j;
  }
  return tags.length - 1;
}

/** The first horizontal position written after `from`: where an object sits. */
function anchorAfter(svg: string, from: number): number | null {
  const m = new RegExp(String.raw`translate\((${NUMBER})|\sc?x="(${NUMBER})"|\sd="M(${NUMBER})`).exec(svg.slice(from, from + 1200));
  const v = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  return v === undefined ? null : Number(v);
}

interface Bars {
  /** Left and right end of every bar (the staff lines), in the units of the drawing. */
  readonly edges: readonly (readonly [number, number])[];
  /** Where the music of the first bar begins: right of clef, key and time signature. */
  readonly musicStart: number;
}

/** The bars of one Akkolade, read off its staff lines. */
function barsOf(svg: string, tags: readonly Tag[]): Bars | null {
  const edges: [number, number][] = [];
  let musicStart = Infinity;
  const stack: string[] = [];
  let measure = -1;
  let haveEdges = false;
  for (const t of tags) {
    if (t.closing) {
      stack.pop();
      continue;
    }
    const cls = t.name === 'g' ? classOf(t.attrs) : '';
    if (cls === 'measure') {
      measure++;
      haveEdges = false;
    }
    if (t.name === 'path' && stack[stack.length - 1] === 'staff' && !haveEdges) {
      const d = new RegExp(String.raw`\sd="M(${NUMBER}) ${NUMBER} L(${NUMBER}) ${NUMBER}"`).exec(t.attrs);
      if (d && Number(d[1]) < Number(d[2])) {
        edges[measure] = [Number(d[1]), Number(d[2])];
        haveEdges = true;
      }
    }
    // The first music is a note, chord or rest of the first bar.
    if (measure === 0 && (cls === 'note' || cls === 'rest' || cls === 'mRest' || cls === 'chord' || cls === 'mSpace') && !stack.includes('note') && !stack.includes('chord')) {
      const at = anchorAfter(svg, t.end);
      if (at !== null) musicStart = Math.min(musicStart, at);
    }
    if (!t.selfClosing) stack.push(t.name === 'g' ? cls : t.name);
  }
  if (edges.length < 2 || edges.some((e) => !e) || !Number.isFinite(musicStart)) return null;
  return { edges, musicStart };
}

/** Maps a position through the pieces: [from → to] for the given edge positions. */
function piecewise(from: readonly number[], to: readonly number[]): (x: number) => number {
  return (x) => {
    if (x <= from[0]! || x >= from[from.length - 1]!) return x;
    let i = 1;
    while (x > from[i]!) i++;
    const a = from[i - 1]!;
    const b = from[i]!;
    return to[i - 1]! + ((x - a) * (to[i]! - to[i - 1]!)) / (b - a);
  };
}

const fmt = (n: number): string => String(Math.round(n)); // whole units: the later steps (tab numbers and clefs) read the staff lines as whole numbers

/** The corners of `d` (absolute commands) moved by `at`; relative commands stay as they are. */
function mapPath(d: string, at: (x: number) => number): string {
  const parts = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  const out: string[] = [];
  let command = '';
  let index = 0; // position of the number inside its command
  for (const p of parts) {
    if (/[A-Za-z]/.test(p)) {
      command = p;
      index = 0;
      out.push(p);
      continue;
    }
    const x = command === 'H' || (command !== '' && command === command.toUpperCase() && command !== 'V' && command !== 'A' && index % 2 === 0);
    out.push(x ? fmt(at(Number(p))) : p);
    index++;
  }
  return out.join(' ').replace(/([A-Za-z]) /g, '$1');
}

function mapPoints(points: string, at: (x: number) => number): string {
  return points.replace(new RegExp(String.raw`(${NUMBER}),(${NUMBER})`, 'g'), (_m, x: string, y: string) => `${fmt(at(Number(x)))},${y}`);
}

/** Where the stems of the notes of one beam are, and how far each of those notes is moved. */
function beamStems(svg: string, tags: readonly Tag[], i: number, shift: (anchor: number) => number): { stem: number; dx: number }[] {
  const end = closeOf(tags, i);
  const out: { stem: number; dx: number }[] = [];
  let depth = 0;
  for (let j = i; j <= end; j++) {
    const t = tags[j]!;
    // inside an object: the first path of a note or chord is its stem
    const last = out[out.length - 1];
    if (!t.closing && t.name === 'path' && last && Number.isNaN(last.stem)) {
      const m = new RegExp(String.raw`\sd="M(${NUMBER})`).exec(t.attrs);
      if (m) last.stem = Number(m[1]);
    }
    if (t.selfClosing) continue;
    if (t.closing) {
      depth--;
      continue;
    }
    depth++;
    const cls = t.name === 'g' ? classOf(t.attrs) : '';
    if (depth === 2 && (cls === 'note' || cls === 'chord')) {
      const at = anchorAfter(svg, t.end);
      if (at !== null) out.push({ stem: Number.NaN, dx: shift(at) });
    }
  }
  return out.filter((s) => !Number.isNaN(s.stem));
}

/** One Akkolade drawn again with its bars at `to` (the edges as they were are `bars.edges`). */
function respace(svg: string, begin: number, end: number, bars: Bars, to: readonly number[]): string {
  const from = [bars.musicStart, ...bars.edges.map((e) => e[1])];
  const f = piecewise(from, [bars.musicStart, ...to]);
  const tags = tagsOf(svg, begin, end);
  const stack: string[] = [];
  let out = '';
  let copied = begin;
  let rigid = -1; // depth of the object that is being moved as a whole
  const beams: ({ stem: number; dx: number }[] | null)[] = [];
  const emit = (t: Tag, text: string) => {
    out += svg.slice(copied, t.index) + text;
    copied = t.end;
  };
  tags.forEach((t, i) => {
    if (t.closing) {
      if (stack.length === rigid) rigid = -1;
      stack.pop();
      beams.pop();
      return;
    }
    const cls = t.name === 'g' ? classOf(t.attrs) : '';
    const inMeasure = stack.includes('measure');
    const moving = rigid >= 0;
    let beam: { stem: number; dx: number }[] | null = null;
    if (!moving) {
      if (t.name === 'g' && inMeasure && !t.selfClosing && !CONTAINERS.has(cls) && !t.attrs.includes(' transform=')) {
        const at = anchorAfter(svg, t.end);
        const dx = at === null ? 0 : f(at) - at;
        if (Math.abs(dx) >= 0.5) emit(t, `<g${t.attrs.replace(/\/$/, '')} transform="translate(${fmt(dx)}, 0)">`);
        rigid = stack.length + 1;
      } else if (t.name === 'g' && cls === 'beam') {
        beam = beamStems(svg, tags, i, (a) => f(a) - a);
      } else if (t.name === 'path') {
        const d = / d="([^"]*)"/.exec(t.attrs);
        if (d) emit(t, `<path${t.attrs.replace(d[0], ` d="${mapPath(d[1]!, f)}"`)}${t.selfClosing ? '/' : ''}>`);
      } else if (t.name === 'polygon') {
        const p = / points="([^"]*)"/.exec(t.attrs);
        const table = [...beams].reverse().find((b) => b) ?? null;
        const at = (x: number): number => {
          if (!table || table.length === 0) return f(x);
          const near = table.reduce((a, b) => (Math.abs(b.stem - x) < Math.abs(a.stem - x) ? b : a));
          return x + near.dx;
        };
        if (p) emit(t, `<polygon${t.attrs.replace(p[0], ` points="${mapPoints(p[1]!, at)}"`)}${t.selfClosing ? '/' : ''}>`);
      } else if (t.name === 'text' || t.name === 'tspan' || t.name === 'rect') {
        const x = new RegExp(String.raw` x="(${NUMBER})"`).exec(t.attrs);
        if (x) emit(t, `<${t.name}${t.attrs.replace(x[0], ` x="${fmt(f(Number(x[1])))}"`)}${t.selfClosing ? '/' : ''}>`);
      } else if (t.name === 'ellipse' || t.name === 'circle') {
        const x = new RegExp(String.raw` cx="(${NUMBER})"`).exec(t.attrs);
        if (x) emit(t, `<${t.name}${t.attrs.replace(x[0], ` cx="${fmt(f(Number(x[1])))}"`)}${t.selfClosing ? '/' : ''}>`);
      } else if (t.name === 'use') {
        const x = new RegExp(String.raw`translate\((${NUMBER}),`).exec(t.attrs);
        if (x) emit(t, `<use${t.attrs.replace(x[0], `translate(${fmt(f(Number(x[1])))},`)}${t.selfClosing ? '/' : ''}>`);
      }
    }
    if (!t.selfClosing) {
      stack.push(t.name === 'g' ? cls : t.name);
      beams.push(beam);
    }
  });
  return out + svg.slice(copied, end);
}

/** Index just behind the element that is opened at `at` in `svg`. */
function endOfElement(svg: string, at: number): number {
  const tags = tagsOf(svg, at, svg.length);
  return tags[closeOf(tags, 0)]!.end;
}

/** A bar may be squeezed to this share of its width at most; a drawing that would need more is left as it is. */
const MIN_SHARE = 0.6;

/** `svg` (one page) with the bars of consecutive Akkoladen with the same number of bars equally wide. */
export function equalizeBars(svg: string): string {
  const starts = [...svg.matchAll(/<g id="[^"]*" class="system"/g)].map((m) => m.index!);
  if (starts.length < 2) return svg;
  const systems = starts.map((begin) => {
    const end = endOfElement(svg, begin);
    return { begin, end, bars: barsOf(svg, tagsOf(svg, begin, end)) };
  });
  const rewritten = new Map<number, string>();
  for (let i = 0; i < systems.length; ) {
    const first = systems[i]!.bars;
    let j = i + 1;
    const same = (b: Bars | null) => first !== null && b !== null && b.edges.length === first.edges.length && Math.abs(b.edges[0]![0] - first.edges[0]![0]) < 3 && Math.abs(b.edges[b.edges.length - 1]![1] - first.edges[first.edges.length - 1]![1]) < 3;
    while (j < systems.length && same(systems[j]!.bars)) j++;
    if (first && j - i >= 2) {
      const run = systems.slice(i, j).map((s) => s.bars!);
      const left = first.edges[0]![0];
      const right = first.edges[first.edges.length - 1]![1];
      const k = first.edges.length;
      const header = Math.max(...run.map((b) => b.musicStart)) - left;
      const target = Array.from({ length: k }, (_, n) => left + header + ((right - left - header) * (n + 1)) / k);
      const fits = run.every((b) => b.edges.every((e, n) => {
        const was = e[1] - (n === 0 ? b.musicStart : e[0]);
        const now = target[n]! - (n === 0 ? b.musicStart : target[n - 1]!);
        return now >= was * MIN_SHARE;
      }));
      if (fits) systems.slice(i, j).forEach((s) => rewritten.set(s.begin, respace(svg, s.begin, s.end, s.bars!, target)));
    }
    i = j;
  }
  if (rewritten.size === 0) return svg;
  let out = '';
  let from = 0;
  for (const s of systems) {
    const text = rewritten.get(s.begin);
    if (text === undefined) continue;
    out += svg.slice(from, s.begin) + text;
    from = s.end;
  }
  return out + svg.slice(from);
}

/** `svg` without the instrument names of its Akkoladen, except those of the first Akkolade on the first page. */
export function dropRepeatedLabels(svg: string, firstPage: boolean): string {
  const starts = [...svg.matchAll(/<g id="[^"]*" class="system"/g)].map((m) => m.index!);
  let out = '';
  let from = 0;
  starts.forEach((begin, n) => {
    if (firstPage && n === 0) return;
    const end = endOfElement(svg, begin);
    const tags = tagsOf(svg, begin, end);
    let chunk = '';
    let copied = begin;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i]!;
      if (t.closing || t.name !== 'g' || !['label', 'labelAbbr'].includes(classOf(t.attrs))) continue;
      const close = closeOf(tags, i);
      chunk += svg.slice(copied, t.index);
      copied = tags[close]!.end;
      i = close;
    }
    out += svg.slice(from, begin) + chunk + svg.slice(copied, end);
    from = end;
  });
  return out + svg.slice(from);
}

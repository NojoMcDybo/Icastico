/**
 * Tablature numbers (ADR 0022).
 *
 * Verovio's own tablature mode places notes by pitch, not by string. So the tab staff is engraved as an
 * ordinary six-line staff whose notes sit on the string lines (`loc`), and here every notehead of that
 * staff is replaced by its fret number – on a white patch that cuts the string line, like printed tab.
 */

const HEAD_WIDTH = 216; // width of a notehead in Verovio's units (staff space = 180)

/** `svg` with the noteheads of the given notes (xml:id → text) replaced by numbers. */
export function applyTabNumbers(svg: string, numbers: ReadonlyMap<string, string>): string {
  let out = svg;
  for (const [id, text] of numbers) {
    const start = out.indexOf(`id="${id}" class="note"`);
    if (start < 0) continue;
    const use = out.indexOf('<use ', start);
    const end = use < 0 ? -1 : out.indexOf('/>', use);
    const at = use < 0 ? -1 : out.indexOf('translate(', use);
    if (use < 0 || end < 0 || at < 0 || at > end) continue;
    const comma = out.indexOf(',', at);
    const close = out.indexOf(')', at);
    const x = Number(out.slice(at + 'translate('.length, comma));
    const y = Number(out.slice(comma + 1, close));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cx = x + HEAD_WIDTH / 2;
    const width = 150 * text.length + 80;
    const patch = `<rect x="${cx - width / 2}" y="${y - 110}" width="${width}" height="220" fill="#fff" />`;
    const label = `<text x="${cx}" y="${y + 75}" font-size="215" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" class="tabnumber">${text}</text>`;
    out = out.slice(0, use) + patch + label + out.slice(end + 2);
  }
  return out;
}

export interface TabStaff {
  /** MEI staff number. */
  readonly n: number;
  /** The tuning to print above the staff, or null for standard tuning. */
  readonly label: string | null;
}

const FONT = 'Segoe UI, Helvetica, Arial, sans-serif';
const escXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The letters T A B in place of a clef at the start of every system of a tablature staff, and the tuning above the
 * first one (Verovio's own tab clef only exists in its string-based tablature mode, which this staff does not use).
 */
export function applyTabClefs(svg: string, staffs: readonly TabStaff[]): string {
  if (staffs.length === 0) return svg;
  const systems = [...svg.matchAll(/<g id="[^"]*" class="system"/g)].map((m) => m.index!);
  let out = '';
  let from = 0;
  let first = true;
  systems.forEach((begin, i) => {
    const end = systems[i + 1] ?? svg.length;
    let chunk = svg.slice(begin, end);
    const measure = chunk.indexOf('class="measure"');
    if (measure >= 0) {
      for (const staff of staffs) {
        const at = chunk.slice(measure).search(new RegExp(String.raw`<g id="m\d+-s${staff.n}" class="staff"`));
        if (at < 0) continue;
        const lines = [...chunk.slice(measure + at).matchAll(/<path d="M(\d+) (\d+) L\d+ \d+"[^>]*?(?:\/>|><\/path>)/g)].slice(0, 6);
        if (lines.length < 6) continue;
        const x = Number(lines[0]![1]);
        const top = Number(lines[0]![2]);
        const insertAt = measure + at + lines[5]!.index! + lines[5]![0].length;
        const cx = x + 380;
        const letters = ['T', 'A', 'B']
          .map((c, k) => `<text x="${cx}" y="${top + 275 + k * 290}" font-size="320" font-weight="bold" text-anchor="middle" font-family="${FONT}" class="tabclef">${c}</text>`)
          .join('');
        const patch = `<rect x="${cx - 200}" y="${top + 30}" width="400" height="840" fill="#fff" />`;
        const tuning = first && staff.label ? `<text x="${x + 100}" y="${top - 100}" font-size="200" font-style="italic" font-family="${FONT}" class="tabtuning">${escXml(staff.label)}</text>` : '';
        chunk = chunk.slice(0, insertAt) + patch + letters + tuning + chunk.slice(insertAt);
        if (staff.label) first = false;
      }
    }
    out += svg.slice(from, begin) + chunk;
    from = end;
  });
  return out + svg.slice(from);
}

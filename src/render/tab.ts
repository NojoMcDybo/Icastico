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

/**
 * A minimal PDF writer for pages that are pictures (ADR 0023).
 *
 * The engraved pages are rendered to JPEG by the UI; this module only wraps them in a valid PDF 1.4 file:
 * one page per picture, the picture filling the page. No fonts, no compression of its own (JPEG is the
 * compression). Opens in every viewer and prints exactly as the page looked on screen.
 */

export interface PdfPage {
  /** Page size in points (1/72 inch); A4 portrait is 595 × 842. */
  readonly width: number;
  readonly height: number;
  /** The picture, as pixels and JPEG bytes. */
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly jpeg: Uint8Array;
}

export const A4_POINTS = { width: 595.28, height: 841.89 } as const;

const encoder = new TextEncoder();

/** The title as a PDF text string: UTF-16BE in hex, so umlauts survive. */
function pdfText(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

const num = (n: number): string => (Math.round(n * 100) / 100).toString();

export function buildPdf(pages: readonly PdfPage[], title: string): Uint8Array {
  if (pages.length === 0) throw new Error('Keine Seiten für das PDF.');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = []; // byte offset of object n+1
  let length = 0;
  const write = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id - 1] = length;
    write(`${id} 0 obj\n${body}`);
    if (stream) {
      write('\nstream\n');
      write(stream);
      write('\nendstream');
    }
    write('\nendobj\n');
  };

  // Object numbers: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image).
  const pageId = (i: number) => 4 + i * 3;
  write('%PDF-1.4\n%âãÏÓ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(3, `<< /Title ${pdfText(title)} /Producer (Icastico) >>`);
  pages.forEach((page, i) => {
    const id = pageId(i);
    const content = encoder.encode(`q ${num(page.width)} 0 0 ${num(page.height)} 0 0 cm /Im0 Do Q`);
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>`, content);
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`, page.jpeg);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  write(`xref\n0 ${count + 1}\n0000000000 65535 f \n`);
  for (let i = 0; i < count; i++) write(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${count + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

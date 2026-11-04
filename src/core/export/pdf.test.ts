import { describe, expect, it } from 'vitest';
import { A4_POINTS, buildPdf } from './pdf';

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const page = (jpeg: number[]) => ({ ...A4_POINTS, imageWidth: 100, imageHeight: 141, jpeg: new Uint8Array(jpeg) });

describe('buildPdf', () => {
  const pdf = buildPdf([page([0xff, 0xd8, 0xff, 0xd9]), page([1, 2, 3, 0xff, 0x0a, 0x0d])], 'Ständchen für Anna');
  const s = text(pdf);

  it('is a PDF 1.4 file with one page object per picture', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 2');
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(2);
    expect(s).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('every entry of the cross-reference table points at its object, even with binary data inside', () => {
    const start = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(9);
    entries.forEach((offset, i) => expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('the picture bytes are stored unchanged and the title survives umlauts', () => {
    expect(s).toContain('/Length 6');
    expect(s).toContain('<FEFF00530074'); // "St…" in UTF-16BE
    expect(s).toContain('00e4'); // ä
  });

  it('refuses an empty document', () => {
    expect(() => buildPdf([], 'x')).toThrow(/Keine Seiten/);
  });
});

/**
 * Pages for the PDF (ADR 0023): engraved with Verovio at A4 size, drawn to a canvas, stored as JPEG.
 * Several short scores can share a page ("Sammelblatt", for teaching material).
 */
import { type Score } from '../core/model';
import { A4_POINTS, type PdfPage, buildPdf } from '../core/export/pdf';
import { scoreToMei } from '../render/mei';
import type { Engraver } from '../render/verovio';

export interface PdfSetup {
  readonly landscape: boolean;
  /** Staff size in percent of Verovio's default. */
  readonly scale: number;
  /** Put short scores one below the other on shared pages instead of starting a page for each. */
  readonly pack: boolean;
  /** Bars per line for this print only: absent = as the score says, 0 = automatic. */
  readonly perSystem?: number;
}

/** The score as it is printed: with the bars per line of the setup, if it has one (the score itself is not changed). */
function shaped(score: Score, setup: PdfSetup): Score {
  if (setup.perSystem === undefined) return score;
  const { layout: _own, ...rest } = score;
  return setup.perSystem > 0 ? { ...rest, layout: { perSystem: setup.perSystem } } : rest;
}

export const SIZES: readonly { readonly label: string; readonly scale: number }[] = [
  { label: 'Klein', scale: 45 },
  { label: 'Mittel', scale: 60 },
  { label: 'Groß', scale: 75 },
];

/** Raster width of an A4 short side at 300 dpi. */
const SHORT_SIDE_PX = 2480;
const MARGIN_PX = 150;
const GAP_PX = 90;

interface Block {
  readonly svg: string;
  /** Size of the picture in the SVG's own units. */
  readonly width: number;
  readonly height: number;
}

function sizeOf(svg: string): { width: number; height: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1, height: 1 };
}

function loadImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  // Verovio's SVG has only a viewBox; a fixed size makes every webview draw it at the size we want.
  const sized = svg.replace('<svg ', `<svg width="${width}" height="${height}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Eine Notenseite ließ sich nicht zeichnen.'));
    };
    img.src = url;
  });
}

const jpegOf = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('Das Seitenbild ließ sich nicht speichern.'))),
      'image/jpeg',
      0.92,
    ),
  );

/** The pages of one score as SVG at A4 size, for printing (the system's print dialog can also save a PDF). */
export function printPages(engraver: Engraver, score: Score, setup: PdfSetup): string[] {
  const mei = scoreToMei(shaped(score, setup));
  const unitsW = (setup.landscape ? 2970 : 2100) * (100 / setup.scale);
  const unitsH = (setup.landscape ? 2100 : 2970) * (100 / setup.scale);
  return [...engraver.engrave(mei.mei, { pageWidth: unitsW, pageHeight: unitsH, scale: setup.scale, tab: mei.tab, tabStaffs: mei.tabStaffs }).pages];
}

/** The PDF of one or several scores. Each score is engraved on its own; with `pack`, pages are filled one score after the other. */
export async function scoresToPdf(engraver: Engraver, scores: readonly Score[], setup: PdfSetup, title: string): Promise<Uint8Array> {
  const pageW = setup.landscape ? Math.round((SHORT_SIDE_PX * A4_POINTS.height) / A4_POINTS.width) : SHORT_SIDE_PX;
  const pageH = setup.landscape ? SHORT_SIDE_PX : Math.round((SHORT_SIDE_PX * A4_POINTS.height) / A4_POINTS.width);
  // The page in 1/10 mm at 100 %; at a smaller staff size the engraver gets a page that is that much larger.
  const unitsW = (setup.landscape ? 2970 : 2100) * (100 / setup.scale);
  const unitsH = (setup.landscape ? 2100 : 2970) * (100 / setup.scale);

  const pages: PdfPage[] = [];
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let cursor = MARGIN_PX;
  const finish = async () => {
    if (!canvas) return;
    pages.push({
      width: setup.landscape ? A4_POINTS.height : A4_POINTS.width,
      height: setup.landscape ? A4_POINTS.width : A4_POINTS.height,
      imageWidth: pageW,
      imageHeight: pageH,
      jpeg: await jpegOf(canvas),
    });
    canvas = null;
    ctx = null;
  };
  const fresh = () => {
    canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pageW, pageH);
    cursor = MARGIN_PX;
  };

  for (const score of scores) {
    const mei = scoreToMei(shaped(score, setup));
    const engraved = engraver.engrave(mei.mei, setup.pack
      ? { pageWidth: unitsW, scale: setup.scale, tab: mei.tab, tabStaffs: mei.tabStaffs }
      : { pageWidth: unitsW, pageHeight: unitsH, scale: setup.scale, tab: mei.tab, tabStaffs: mei.tabStaffs });
    const blocks: Block[] = engraved.pages.map((svg) => ({ svg, ...sizeOf(svg) }));
    for (const block of blocks) {
      if (setup.pack) {
        const h = Math.round((block.height / block.width) * pageW);
        if (canvas && cursor + h > pageH - MARGIN_PX) await finish();
        if (!canvas) fresh();
        const img = await loadImage(block.svg, pageW, h);
        ctx!.drawImage(img, 0, cursor, pageW, h);
        cursor += h + GAP_PX;
      } else {
        await finish();
        fresh();
        const img = await loadImage(block.svg, pageW, pageH);
        ctx!.drawImage(img, 0, 0, pageW, pageH);
        await finish();
      }
    }
  }
  await finish();
  return buildPdf(pages, title);
}

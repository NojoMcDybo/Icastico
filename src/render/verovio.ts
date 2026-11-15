/**
 * Thin wrapper around the Verovio engraving engine (C++ compiled to WASM).
 * Verovio is the ONLY place that knows about engraving; if it ever becomes a
 * bottleneck, this module is what gets replaced (see docs/decisions/0002).
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { applyTabClefs, applyTabNumbers, type TabStaff } from './tab';

export interface EngraveOptions {
  /** Page width in Verovio units (1/10 mm at scale 100). */
  readonly pageWidth?: number;
  /** Zoom in percent. */
  readonly scale?: number;
  /** Fixed page height (e.g. A4 preview pictures); default: as tall as the music. */
  readonly pageHeight?: number;
  /** Page margins in mm (ADR 0044); absent = 6 mm at the default size. */
  readonly margins?: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
  /** Tablature notes (xml:id → fret number) to draw as numbers, from `scoreToMei`. */
  readonly tab?: ReadonlyMap<string, string>;
  /** The tablature staves, to get their "TAB" and tuning, from `scoreToMei`. */
  readonly tabStaffs?: readonly TabStaff[];
}

export interface EngraveResult {
  readonly pages: readonly string[];
  /** Verovio's warnings/errors for this render, empty if clean. */
  readonly log: string;
}

export class Engraver {
  private constructor(private readonly toolkit: VerovioToolkit) {}

  static async create(): Promise<Engraver> {
    const module = await createVerovioModule();
    return new Engraver(new VerovioToolkit(module));
  }

  get version(): string {
    return this.toolkit.getVersion();
  }

  engrave(mei: string, options: EngraveOptions = {}): EngraveResult {
    // Verovio counts in units that shrink with the zoom: 1 mm of paper is 10 units at 100 %.
    const unit = (mm: number | undefined) => (mm === undefined ? 60 : Math.min(500, Math.round((mm * 10 * 100) / (options.scale ?? 40))));  // Verovio allows 0 to 500
    this.toolkit.setOptions({
      pageWidth: options.pageWidth ?? 2100,
      scale: options.scale ?? 40,
      pageHeight: options.pageHeight ?? 2970,
      adjustPageHeight: options.pageHeight === undefined,
      // Line breaks written into the music (ADR 0031) are kept exactly; without any, as many bars as fit.
      breaks: mei.includes('<sb ') || mei.includes('<pb ') ? 'encoded' : 'auto',
      header: mei.includes('<pgHead') ? 'encoded' : 'none',
      footer: 'none',
      svgViewBox: true,
      // Justify every system, including the last one.
      minLastJustification: 0,
      pageMarginTop: unit(options.margins?.top),
      pageMarginBottom: unit(options.margins?.bottom),
      pageMarginLeft: unit(options.margins?.left),
      pageMarginRight: unit(options.margins?.right),
    });
    if (!this.toolkit.loadData(mei)) {
      throw new Error(`Verovio konnte die Partitur nicht laden:\n${this.toolkit.getLog()}`);
    }
    const pages: string[] = [];
    const count = this.toolkit.getPageCount();
    for (let page = 1; page <= count; page++) {
      const svg = this.toolkit.renderToSVG(page, false);
      const numbered = options.tab?.size ? applyTabNumbers(svg, options.tab) : svg;
      pages.push(options.tabStaffs?.length ? applyTabClefs(numbered, options.tabStaffs) : numbered);
    }
    return { pages, log: this.toolkit.getLog().trim() };
  }
}

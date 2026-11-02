/**
 * Preview pictures for the library: the first page of a score, engraved by
 * Verovio as an A4 page, used as an <img>. As an image the SVG is isolated –
 * its ids cannot clash with the score open in the editor.
 */
import type { LibraryItem } from '../library/library';
import { scoreToMei } from '../render/mei';
import type { Engraver } from '../render/verovio';

/** A4 proportions; a bit smaller than print so the notes stay readable on a tile. */
const A4 = { pageWidth: 1500, pageHeight: 2121, scale: 40 } as const;

export class Thumbnails {
  private readonly cache = new Map<string, string>();

  constructor(private readonly engraver: Engraver) {}

  /** Image URL for an item, rendered on first use; null if it cannot be read. */
  url(item: LibraryItem): string | null {
    if (!item.score) return null;
    const key = `${item.path}|${item.modified}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      const svg = this.engraver.engrave(scoreToMei(item.score).mei, A4).pages[0];
      if (!svg) return null;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      // Drop older pictures of the same file.
      for (const [k, u] of this.cache) {
        if (k.startsWith(`${item.path}|`)) {
          URL.revokeObjectURL(u);
          this.cache.delete(k);
        }
      }
      this.cache.set(key, url);
      return url;
    } catch {
      return null;
    }
  }

  has(item: LibraryItem): boolean {
    return this.cache.has(`${item.path}|${item.modified}`);
  }
}

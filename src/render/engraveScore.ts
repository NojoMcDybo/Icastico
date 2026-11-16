/**
 * Engraves a score with the page layout it asks for (ADR 0042): lines as written in `layout`, and after every
 * `systemsPerPage` Akkoladen a new page: Verovio's own page limit where it breaks the lines, written-in page breaks
 * where the lines are fixed (one pass either way).
 */
import { type Score, systemBreaks } from '../core/model';
import { type MeiOptions, type MeiResult, scoreToMei } from './mei';
import type { EngraveOptions, EngraveResult, Engraver } from './verovio';

/** The bars (0-based index) that start a line in a drawing: the first bar of every system. */
export function systemStartsOf(pages: readonly string[], measureIds: readonly string[]): number[] {
  const starts: number[] = [];
  for (const svg of pages) {
    for (const system of svg.split('class="system"').slice(1)) {
      const id = /<g id="(m-?\d+)" class="measure"/.exec(system)?.[1];
      const index = id === undefined ? -1 : measureIds.indexOf(id);
      if (index >= 0) starts.push(index);
    }
  }
  return starts;
}

export function engraveScore(
  engraver: Engraver,
  score: Score,
  meiOptions: MeiOptions = {},
  options: EngraveOptions = {},
): { readonly mei: MeiResult; readonly engraved: EngraveResult } {
  const per = score.layout?.systemsPerPage;
  options = score.layout?.margins && !options.margins ? { ...options, margins: score.layout.margins } : options;
  const draw = (mei: MeiResult, extra: EngraveOptions = {}) => engraver.engrave(mei.mei, { ...options, ...extra, tab: mei.tab, tabStaffs: mei.tabStaffs });
  const first = scoreToMei(score, meiOptions);
  if (per === undefined || per < 1) return { mei: first, engraved: draw(first) };

  // Lines fixed in the score: Verovio keeps them exactly and ignores its own page limit, so the page breaks are written in.
  const lines = systemBreaks(score, first.measureIds.length);
  if (lines.length === 0) return { mei: first, engraved: draw(first, { systemsPerPage: per }) };
  const pageBreaks = new Set(lines.filter((_, k) => (k + 1) % per === 0)); // the (per+1)th, (2·per+1)th … line starts a page
  if (pageBreaks.size === 0) return { mei: first, engraved: draw(first) };
  const mei = scoreToMei(score, { ...meiOptions, pageBreaks });
  return { mei, engraved: draw(mei) };
}

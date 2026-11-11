/**
 * Engraves a score with the page layout it asks for (ADR 0042): lines as written in `layout`, and after every
 * `systemsPerPage` Akkoladen a new page. Where the lines are left to the engraver, a first pass finds out where it
 * would break them, so the page breaks can be put between those lines.
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
  const first = scoreToMei(score, meiOptions);
  const run = (mei: MeiResult) => engraver.engrave(mei.mei, { ...options, tab: mei.tab, tabStaffs: mei.tabStaffs });
  if (per === undefined || per < 1) return { mei: first, engraved: run(first) };

  const count = first.measureIds.length;
  let lines = systemBreaks(score, count); // line starts after the first bar, when the score fixes them
  let auto: EngraveResult | null = null;
  if (lines.length === 0) {
    auto = run(first);
    lines = systemStartsOf(auto.pages, first.measureIds).filter((i) => i > 0);
  }
  const pageBreaks = new Set(lines.filter((_, k) => (k + 1) % per === 0)); // the (per+1)th, (2·per+1)th … line starts a page
  if (pageBreaks.size === 0) return { mei: first, engraved: auto ?? run(first) };
  const laidOut: Score = { ...score, layout: { ...score.layout, breaks: lines } };
  const mei = scoreToMei(laidOut, { ...meiOptions, pageBreaks });
  return { mei, engraved: run(mei) };
}


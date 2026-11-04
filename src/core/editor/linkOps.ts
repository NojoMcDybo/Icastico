/**
 * Keeping ties and slides valid (ADR 0014).
 *
 * Every score change goes through `withValidLinks`: a link whose tone is gone is
 * dropped in the same step (deleting a tone removes its connections); a change that
 * would leave a link impossible (tied notes pulled apart, a tied pitch changed, …)
 * is refused with a message and changes nothing – no silent repairs.
 */
import { type Link, type LinkKind, type Score, linkBreak, locateTones } from '../model';
import type { EditorState } from './state';

export const linksOf = (score: Score): readonly Link[] => score.links ?? [];

/** The score with exactly these links (the field is left out when there are none). */
export function withLinks(score: Score, links: readonly Link[]): Score {
  const { links: _old, ...rest } = score;
  return links.length > 0 ? { ...rest, links } : rest;
}

export function freshLinkId(score: Score, extra: readonly Link[] = []): string {
  const used = new Set([...linksOf(score), ...extra].map((l) => l.id));
  let n = 1;
  while (used.has(`link-${n}`)) n++;
  return `link-${n}`;
}

const KEY: Record<LinkKind, string> = { tie: 'T', slide: 'Strg+Umschalt+G' };
const NAME: Record<LinkKind, string> = { tie: 'Haltebogen', slide: 'Gleiten' };

/** `after` if its links are fine (dangling ones dropped), else `before` with an explaining message. */
export function withValidLinks(before: EditorState, after: EditorState): EditorState {
  if (after.score === before.score || !after.score.links?.length) return after;
  const spots = locateTones(after.score);
  const alive = after.score.links.filter((l) => spots.has(l.from) && spots.has(l.to));
  for (const l of alive) {
    const why = linkBreak(l.kind, spots.get(l.from)!, spots.get(l.to)!);
    if (why) return { ...before, message: `Das würde ${l.kind === 'tie' ? 'einen Haltebogen' : 'eine Gleitverbindung'} zerreißen: ${why} Erst lösen (${KEY[l.kind]}).` };
  }
  return alive.length === after.score.links.length ? after : { ...after, score: withLinks(after.score, alive) };
}

export { NAME as LINK_NAME };

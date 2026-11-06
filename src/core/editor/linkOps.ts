/**
 * Keeping ties and slides valid (ADR 0014).
 *
 * Every score change goes through `withValidLinks`: a link whose tone is gone is
 * dropped in the same step (deleting a tone removes its connections); a change that
 * would leave a link impossible (tied notes pulled apart, a tied note shortened, …)
 * is refused with a message and changes nothing – no silent repairs.
 * Tied notes are one note to the ear: changing the pitch of one of them carries the
 * whole chain along (`carryTies`).
 */
import { type Link, type LinkKind, type Score, linkBreak, locateTones } from '../model';
import { type Pitch, midiOf } from '../pitch';
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

/**
 * Ties join notes of one pitch. When one end of a tie got a new pitch, the other end follows
 * (and so on along the chain), with the same spelling. A partner that would collide with another
 * tone of its chord stays as it is – the tie is then refused like any impossible link.
 */
export function carryTies(before: Score, after: Score): Score {
  const ties = (after.links ?? []).filter((l) => l.kind === 'tie');
  if (ties.length === 0) return after;
  const was = new Map<string, number>();
  for (const part of before.parts) for (const v of part.voices) for (const e of v.events) for (const t of e.tones) was.set(t.id, midiOf(t.pitch));
  const now = new Map<string, Pitch>();
  for (const part of after.parts) for (const v of part.voices) for (const e of v.events) for (const t of e.tones) now.set(t.id, t.pitch);
  const next = new Map<string, Pitch>();
  const current = (id: string): Pitch | undefined => next.get(id) ?? now.get(id);
  const moved = (id: string, p: Pitch): boolean => was.has(id) && was.get(id) !== midiOf(p);
  for (let round = 0; round <= ties.length; round++) {
    let changed = false;
    for (const l of ties) {
      const a = current(l.from);
      const b = current(l.to);
      if (!a || !b || midiOf(a) === midiOf(b)) continue;
      if (moved(l.from, a) && !moved(l.to, b)) next.set(l.to, a);
      else if (moved(l.to, b) && !moved(l.from, a)) next.set(l.from, b);
      else continue;
      changed = true;
    }
    if (!changed) break;
  }
  if (next.size === 0) return after;
  const clash = (tones: readonly { id: string; pitch: Pitch }[], id: string, p: Pitch) => tones.some((t) => t.id !== id && midiOf(next.get(t.id) ?? t.pitch) === midiOf(p));
  return {
    ...after,
    parts: after.parts.map((part) => ({
      ...part,
      voices: part.voices.map((v) => ({
        ...v,
        events: v.events.map((e) => {
          if (!e.tones.some((t) => next.has(t.id))) return e;
          const tones = e.tones
            .map((t) => (next.has(t.id) && !clash(e.tones, t.id, next.get(t.id)!) ? { ...t, pitch: next.get(t.id)! } : t))
            .sort((x, y) => midiOf(x.pitch) - midiOf(y.pitch));
          return { ...e, tones };
        }),
      })),
    })),
  };
}

/** `after` if its links are fine (dangling ones dropped), else `before` with an explaining message. */
export function withValidLinks(before: EditorState, rawAfter: EditorState): EditorState {
  if (rawAfter.score === before.score || !rawAfter.score.links?.length) return rawAfter;
  const carried = carryTies(before.score, rawAfter.score);
  const after = carried === rawAfter.score ? rawAfter : { ...rawAfter, score: carried };
  const spots = locateTones(after.score);
  const links = after.score.links ?? [];
  const alive = links.filter((l) => spots.has(l.from) && spots.has(l.to));
  const out = new Set<string>();
  const into = new Map<string, LinkKind[]>(); // several glides may end in one tone, a tie only alone
  for (const l of alive) {
    const arriving = into.get(l.to) ?? [];
    if (out.has(l.from) || (arriving.length > 0 && (l.kind === 'tie' || arriving.includes('tie')))) {
      return { ...before, message: 'Aus einem Ton geht nur eine Verbindung ab, und in einen Ton kommt ein Haltebogen nur allein an. Erst die andere lösen.' };
    }
    out.add(l.from);
    into.set(l.to, [...arriving, l.kind]);
    const why = linkBreak(l.kind, spots.get(l.from)!, spots.get(l.to)!);
    if (why) return { ...before, message: `Das würde ${l.kind === 'tie' ? 'einen Haltebogen' : 'eine Gleitverbindung'} zerreißen: ${why} Erst lösen (${KEY[l.kind]}).` };
  }
  return alive.length === links.length ? after : { ...after, score: withLinks(after.score, alive) };
}


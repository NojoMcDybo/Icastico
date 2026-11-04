/**
 * An individual part ("Einzelstimme", ADR 0023): a copy of the score with only one instrument.
 * Meter, key, tempo, upbeat and chord symbols stay; links to tones of other instruments go.
 */
import { type Score } from './model';

export function extractPart(score: Score, partId: string): Score {
  const part = score.parts.find((p) => p.id === partId);
  if (!part) throw new Error('Diese Stimme gibt es nicht.');
  const tones = new Set(part.voices.flatMap((v) => v.events.flatMap((e) => e.tones.map((t) => t.id))));
  const links = (score.links ?? []).filter((l) => tones.has(l.from) && tones.has(l.to));
  const { links: _links, ...rest } = score;
  return { ...rest, title: `${score.title} – ${part.name}`, ...(links.length ? { links } : {}), parts: [part] };
}

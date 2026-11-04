import { describe, expect, it } from 'vitest';
import type { PlaybackPlan, SoundNote } from '../core/playback';
import { BASE_CHANNEL, BEND_CENTER, BEND_MAX, BEND_STEP, GLIDE_CHANNELS, type MidiAction, bendValue, midiActions } from './midiPlan';

const PROGRAMS = { voice: 52, guitar: 24, piano: 0 } as const;
const fixed = (start: number, end: number, midi: number, instrument: SoundNote['instrument'] = 'piano'): SoundNote => ({
  instrument,
  start,
  end,
  path: [{ t: start, midi }, { t: end, midi }],
});
/** C5 held, then a glide to G5 through a gap, then G5 held: one sound. */
const glide = (start = 0): SoundNote => ({
  instrument: 'voice',
  start,
  end: start + 3,
  path: [{ t: start, midi: 72 }, { t: start + 1, midi: 72 }, { t: start + 2, midi: 79 }, { t: start + 3, midi: 79 }],
});
const plan = (...notes: SoundNote[]): PlaybackPlan => ({ notes, length: Math.max(0, ...notes.map((n) => n.end)) });
const of = (actions: MidiAction[], type: MidiAction['type'], channel?: number) => actions.filter((a) => a.type === type && (channel === undefined || a.channel === channel));

describe('MIDI actions for a playback plan', () => {
  it('ordinary notes share their instrument channel: on at the start, off at the end, program first', () => {
    const a = midiActions(plan(fixed(0, 1, 60), fixed(0, 1, 64, 'guitar')), PROGRAMS);
    expect(of(a, 'on').map((x) => [x.channel, (x as { key: number }).key])).toEqual([[BASE_CHANNEL.piano, 60], [BASE_CHANNEL.guitar, 64]]);
    expect(of(a, 'off')).toHaveLength(2);
    const firstOn = a.findIndex((x) => x.type === 'on');
    expect(a.slice(0, firstOn).filter((x) => x.type === 'program').map((x) => (x as { value: number }).value).sort()).toEqual([0, 24]);
  });

  it('a glide gets a channel of its own with a bend range that fits and a centred wheel before the note', () => {
    const a = midiActions(plan(glide()), PROGRAMS);
    const ch = of(a, 'on')[0]!.channel;
    expect(GLIDE_CHANNELS).toContain(ch);
    expect(of(a, 'range', ch)[0]).toMatchObject({ value: 7 });
    const on = a.findIndex((x) => x.type === 'on');
    expect(a.slice(0, on).some((x) => x.type === 'bend' && (x as { value: number }).value === BEND_CENTER)).toBe(true);
    expect(a.slice(0, on).some((x) => x.type === 'program' && x.channel === ch && (x as { value: number }).value === 52)).toBe(true);
  });

  it('the bend follows the pitch curve: nothing during the held notes, even steps through the glide, end on the target', () => {
    const a = midiActions(plan(glide()), PROGRAMS);
    const ch = of(a, 'on')[0]!.channel;
    const bends = of(a, 'bend', ch).filter((x) => x.t >= 1 && x.t <= 2) as { t: number; value: number }[];
    expect(bends.length).toBeGreaterThanOrEqual(Math.floor(1 / BEND_STEP));
    expect(bends.every((b, i) => i === 0 || b.value >= bends[i - 1]!.value)).toBe(true);
    expect(bends[bends.length - 1]!.value).toBe(bendValue(79, 72, 7));
    const middle = bends.find((b) => Math.abs(b.t - 1.5) < 0.006)!;
    expect(middle.value).toBe(bendValue(75.5, 72, 7));
    expect(of(a, 'bend', ch).filter((x) => x.t > 2 && x.t < 3)).toEqual([]); // the held target needs no more messages
  });

  it('the note off uses the key that was struck, and the channel is reset after the tail', () => {
    const a = midiActions(plan(glide()), PROGRAMS);
    const ch = of(a, 'on')[0]!.channel;
    expect((of(a, 'off', ch)[0] as { key: number }).key).toBe(72);
    const reset = of(a, 'bend', ch).at(-1)!;
    expect(reset.t).toBeGreaterThan(3);
    expect((reset as { value: number }).value).toBe(BEND_CENTER);
  });

  it('two glides at once take two channels; after the tail a channel is used again', () => {
    const two = of(midiActions(plan(glide(0), glide(0.5)), PROGRAMS), 'on');
    expect(new Set(two.map((x) => x.channel)).size).toBe(2);
    const later = of(midiActions(plan(glide(0), glide(10)), PROGRAMS), 'on');
    expect(later[0]!.channel).toBe(later[1]!.channel);
  });

  it('more glides at once than channels: the extra ones play at a fixed pitch on the instrument channel', () => {
    const many = Array.from({ length: GLIDE_CHANNELS.length + 2 }, () => glide(0));
    const ons = of(midiActions(plan(...many), PROGRAMS), 'on');
    expect(ons.filter((x) => GLIDE_CHANNELS.includes(x.channel))).toHaveLength(GLIDE_CHANNELS.length);
    expect(ons.filter((x) => x.channel === BASE_CHANNEL.voice)).toHaveLength(2);
  });

  it('is sorted by time and bend values stay inside the wheel', () => {
    const a = midiActions(plan(glide(), fixed(0.2, 2, 50), glide(1)), PROGRAMS);
    expect(a.every((x, i) => i === 0 || x.t >= a[i - 1]!.t)).toBe(true);
    for (const b of of(a, 'bend') as { value: number }[]) expect(b.value >= 0 && b.value <= BEND_MAX).toBe(true);
    expect(bendValue(100, 60, 2)).toBe(BEND_MAX);
    expect(bendValue(20, 60, 2)).toBe(0);
  });

  it('an empty plan makes no messages', () => {
    expect(midiActions(plan(), PROGRAMS)).toEqual([]);
  });
});

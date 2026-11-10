import { describe, expect, it } from 'vitest';
import type { PlaybackPlan, SoundNote } from '../core/playback';
import type { InstrumentId } from '../core/instruments';
import { AUDITION_CHANNEL, BEND_CENTER, BEND_MAX, BEND_STEP, GLIDE_CHANNELS, type MidiAction, SHARED_CHANNELS, bendValue, midiActions, sharedChannels } from './midiPlan';

const PROGRAMS: Record<InstrumentId, number> = {
  voice: 52, guitar: 24, tab: 24, piano: 0, violin: 40, viola: 41, cello: 42, contrabass: 43, ebass: 33, flute: 73, recorder: 74, oboe: 68, bassoon: 70,
};
/** The first sound of a piece takes the first shared channel. */
const FIRST = SHARED_CHANNELS[0]!;
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

/** A held note that fades in over a second and out over the last second of three. */
const fading = (start = 0): SoundNote => ({
  ...fixed(start, start + 3, 60),
  volume: 64,
  gain: [{ t: start, level: 0 }, { t: start + 1, level: 1 }, { t: start + 2, level: 1 }, { t: start + 3, level: 0 }],
});

describe('MIDI actions for a playback plan', () => {
  it('ordinary notes share a channel per sound: on at the start, off at the end, program first', () => {
    const a = midiActions(plan(fixed(0, 1, 60), fixed(0, 1, 64, 'guitar')), PROGRAMS);
    expect(of(a, 'on').map((x) => [x.channel, (x as { key: number }).key])).toEqual([[FIRST, 60], [SHARED_CHANNELS[1], 64]]);
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
    expect(ons.filter((x) => x.channel === FIRST)).toHaveLength(2);
  });

  it('is sorted by time and bend values stay inside the wheel', () => {
    const a = midiActions(plan(glide(), fixed(0.2, 2, 50), glide(1)), PROGRAMS);
    expect(a.every((x, i) => i === 0 || x.t >= a[i - 1]!.t)).toBe(true);
    for (const b of of(a, 'bend') as { value: number }[]) expect(b.value >= 0 && b.value <= BEND_MAX).toBe(true);
    expect(bendValue(100, 60, 2)).toBe(BEND_MAX);
    expect(bendValue(20, 60, 2)).toBe(0);
  });

  it('the volume of a note is its velocity', () => {
    const a = midiActions(plan({ ...fixed(0, 1, 60), volume: 40 }), PROGRAMS);
    expect(of(a, 'on')[0]).toMatchObject({ velocity: 40, channel: FIRST });
  });

  it('a fading note gets a channel of its own and follows its level through expression', () => {
    const a = midiActions(plan(fading(), fixed(0, 3, 64)), PROGRAMS);
    const ons = of(a, 'on') as { channel: number; key: number; velocity: number }[];
    const own = ons.find((x) => x.key === 60)!;
    expect(GLIDE_CHANNELS).toContain(own.channel);
    expect(own.velocity).toBe(64);
    expect(ons.find((x) => x.key === 64)!.channel).toBe(FIRST); // an even note stays on the shared channel
    const e = of(a, 'expression', own.channel) as { t: number; value: number }[];
    expect(e[0]).toMatchObject({ value: 0 });
    expect(e[0]!.t).toBeLessThan(0); // set before the note is struck
    expect(Math.max(...e.map((x) => x.value))).toBe(127);
    const rising = e.filter((x) => x.t >= 0 && x.t <= 1);
    expect(rising.every((x, i) => i === 0 || x.value >= rising[i - 1]!.value)).toBe(true);
    expect(e.filter((x) => x.t > 1.05 && x.t < 1.95)).toEqual([]); // held at full: nothing to send
    expect(e.at(-1)).toMatchObject({ value: 127 }); // reset after the tail
    expect(e.at(-1)!.t).toBeGreaterThan(3);
    expect(of(a, 'expression', FIRST)).toEqual([]);
  });

  it('a level jump (a tie between loud and soft) is one message at that moment', () => {
    const jumping: SoundNote = {
      ...fixed(0, 2, 60),
      gain: [{ t: 0, level: 1 }, { t: 1, level: 1 }, { t: 1, level: 0.5 }, { t: 2, level: 0.5 }],
    };
    const e = of(midiActions(plan(jumping), PROGRAMS), 'expression') as { t: number; value: number }[];
    expect(e.filter((x) => x.t === 1)).toEqual([expect.objectContaining({ value: 64 })]);
  });

  it('more shaped sounds at once than channels: the extra ones play evenly on the instrument channel', () => {
    const many = Array.from({ length: GLIDE_CHANNELS.length + 1 }, () => fading());
    const ons = of(midiActions(plan(...many), PROGRAMS), 'on');
    expect(ons.filter((x) => GLIDE_CHANNELS.includes(x.channel))).toHaveLength(GLIDE_CHANNELS.length);
    expect(ons.filter((x) => x.channel === FIRST)).toHaveLength(1);
  });

  it('every sound used gets a channel by its program; same program, same channel; the audition channel is never shared', () => {
    const c = sharedChannels([0, 24, 0, 40]);
    expect([...c]).toEqual([[0, 0], [24, 1], [40, 2]]);
    expect(SHARED_CHANNELS).not.toContain(AUDITION_CHANNEL);
    expect(GLIDE_CHANNELS).not.toContain(AUDITION_CHANNEL);
    const a = midiActions(plan(fixed(0, 1, 60, 'violin'), fixed(0, 1, 64, 'viola'), fixed(0, 1, 40, 'cello')), PROGRAMS);
    expect(of(a, 'program').map((x) => [x.channel, (x as { value: number }).value])).toEqual([[0, 40], [1, 41], [2, 42]]);
  });

  it('more different sounds than shared channels: the last channel takes the rest', () => {
    const c = sharedChannels([0, 1, 2, 3, 4, 5, 6]);
    expect(c.get(6)).toBe(SHARED_CHANNELS.at(-1));
  });

  it('an empty plan makes no messages', () => {
    expect(midiActions(plan(), PROGRAMS)).toEqual([]);
  });
});

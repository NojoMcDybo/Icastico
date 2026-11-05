import { describe, expect, it, vi } from 'vitest';
import { listenToMidi, noteOn } from '../../platform/midi';
import { SpeechSegmenter } from './vad';

const RATE = 16000;
const BLOCK = 1600; // 0.1 s
const block = (level: number) => Float32Array.from({ length: BLOCK }, (_, i) => level * Math.sin(i / 3));

/** Feeds `seconds` of a constant loudness and returns the words that came out. */
function play(vad: SpeechSegmenter, level: number, seconds: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    const word = vad.feed(block(level), RATE);
    if (word) out.push(word);
  }
  return out;
}

describe('cutting words out of a microphone signal', () => {
  it('a word with pauses around it comes out once, with a little lead-in', () => {
    const vad = new SpeechSegmenter();
    expect(play(vad, 0.002, 2)).toEqual([]);
    expect(play(vad, 0.3, 0.6)).toEqual([]); // still speaking
    const words = play(vad, 0.002, 1);
    expect(words).toHaveLength(1);
    const seconds = words[0]!.length / RATE;
    expect(seconds).toBeGreaterThan(0.6 + 0.25); // word + lead-in + the pause that ended it
    expect(seconds).toBeLessThan(1.6);
    expect(play(vad, 0.002, 2)).toEqual([]);
  });

  it('two words with a pause between come out as two', () => {
    const vad = new SpeechSegmenter();
    play(vad, 0.002, 1);
    const first = [...play(vad, 0.3, 0.4), ...play(vad, 0.002, 1)];
    const second = [...play(vad, 0.3, 0.4), ...play(vad, 0.002, 1)];
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it('a click is not a word, steady room noise is not either, and a never-ending noise is cut after 3 seconds', () => {
    const vad = new SpeechSegmenter();
    expect(play(vad, 0.002, 1)).toEqual([]);
    expect([...play(vad, 0.3, 0.1), ...play(vad, 0.002, 1)]).toEqual([]);
    expect(play(vad, 0.01, 5)).toEqual([]); // below the floor
    const long = play(vad, 0.3, 4);
    expect(long.length).toBeGreaterThanOrEqual(1);
    expect(long[0]!.length / RATE).toBeLessThan(3.5);
  });
});

describe('MIDI input', () => {
  it('only a note-on with a velocity is a note', () => {
    expect(noteOn([0x90, 60, 100])).toEqual({ pitch: 60, velocity: 100 });
    expect(noteOn([0x95, 72, 1])).toEqual({ pitch: 72, velocity: 1 }); // any channel
    expect(noteOn([0x90, 60, 0])).toBeNull(); // note-on with velocity 0 is a note-off
    expect(noteOn([0x80, 60, 64])).toBeNull();
    expect(noteOn([0xb0, 64, 127])).toBeNull(); // pedal
    expect(noteOn([])).toBeNull();
  });

  it('listens to every keyboard, also one plugged in later, and lets go on stop', async () => {
    const make = (name: string) => ({ name, onmidimessage: null as null | ((e: { data: Uint8Array | null }) => void) });
    const first = make('Piano');
    const inputs = [first];
    const access = { inputs: { forEach: (cb: (i: typeof first) => void) => inputs.forEach(cb) }, onstatechange: null as null | (() => void) };
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => access });
    const heard: number[] = [];
    const midi = await listenToMidi((n) => heard.push(n.pitch));
    expect(midi.inputs).toEqual(['Piano']);
    first.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]) });
    const second = make('Stage');
    inputs.push(second);
    access.onstatechange!();
    second.onmidimessage!({ data: new Uint8Array([0x90, 64, 90]) });
    expect(heard).toEqual([60, 64]);
    midi.stop();
    expect(first.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();
    vi.stubGlobal('navigator', {});
    await expect(listenToMidi(() => undefined)).rejects.toThrow(/kein MIDI/);
    vi.unstubAllGlobals();
  });
});

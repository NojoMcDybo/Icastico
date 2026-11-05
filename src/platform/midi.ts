/**
 * MIDI keyboards (architecture rule 8: the editor only knows this interface). Today the web view's own MIDI
 * (Web MIDI: works in Chromium and the Windows web view); the Mac web view has none, so there the message says so
 * and a native connection (Rust) is the way forward.
 */
export interface MidiNote {
  /** MIDI note number 0–127. */
  readonly pitch: number;
  /** 1–127. */
  readonly velocity: number;
}

export interface MidiListener {
  stop(): void;
  /** Names of the keyboards found when it started. */
  readonly inputs: readonly string[];
}

/** The note-on of a raw MIDI message, or null (note off, a note-on with velocity 0, controllers, …). */
export function noteOn(data: ArrayLike<number>): MidiNote | null {
  const [status, pitch, velocity] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
  return (status & 0xf0) === 0x90 && velocity > 0 ? { pitch, velocity } : null;
}

interface MidiInputLike {
  readonly name?: string | null;
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null;
}

interface MidiAccessLike {
  readonly inputs: { forEach(callback: (input: MidiInputLike) => void): void };
  onstatechange: (() => void) | null;
}

/** Starts listening to every connected MIDI keyboard (and to ones plugged in later). Throws with a readable message. */
export async function listenToMidi(onNote: (note: MidiNote) => void): Promise<MidiListener> {
  const request = (navigator as unknown as { requestMIDIAccess?: () => Promise<MidiAccessLike> }).requestMIDIAccess;
  if (!request) throw new Error('Dieses Fenster kann kein MIDI (auf dem Mac kommt das mit der nativen Anbindung).');
  let access: MidiAccessLike;
  try {
    access = await request.call(navigator);
  } catch {
    throw new Error('MIDI ist nicht erlaubt.');
  }
  const names: string[] = [];
  const attach = () => {
    names.length = 0;
    access.inputs.forEach((input) => {
      names.push(input.name ?? 'MIDI-Eingang');
      input.onmidimessage = (event) => {
        const note = event.data ? noteOn(event.data) : null;
        if (note) onNote(note);
      };
    });
  };
  attach();
  access.onstatechange = attach; // a keyboard plugged in while recording
  return {
    inputs: names,
    stop: () => {
      access.onstatechange = null;
      access.inputs.forEach((input) => (input.onmidimessage = null));
    },
  };
}

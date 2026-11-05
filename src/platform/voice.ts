/**
 * Where spoken words come from (plan "Sprachbefehle"). The editor only knows this interface; what stands behind it
 * is a platform matter (architecture rule 8). Today that is a stand-in without microphone – the real recogniser
 * (Rust, package 3) is not chosen yet and is decided after a test with the owner's voice.
 */
export interface VoiceHeard {
  /** The word or phrase the recogniser understood. */
  readonly text: string;
  /** How sure it is, 0–1. */
  readonly confidence: number;
}

export interface VoiceSource {
  onHeard(handler: (heard: VoiceHeard) => void): void;
}

/** A source that hears what it is told: for the text field of the test mode and for the end-to-end tests. */
export class StandInVoice implements VoiceSource {
  private readonly handlers: ((heard: VoiceHeard) => void)[] = [];

  onHeard(handler: (heard: VoiceHeard) => void): void {
    this.handlers.push(handler);
  }

  hear(text: string, confidence = 1): void {
    for (const handler of this.handlers) handler({ text, confidence });
  }
}

declare global {
  interface Window {
    /** Test hook: pretend the microphone heard `text`. */
    __voiceHear?: (text: string, confidence?: number) => void;
  }
}

/** The voice source of this platform. For now always the stand-in, reachable as `window.__voiceHear(text, confidence)`. */
export function currentVoice(): StandInVoice {
  const voice = new StandInVoice();
  window.__voiceHear = (text, confidence) => voice.hear(text, confidence);
  return voice;
}

/** The little text field that replaces the microphone: only in development or with `?voice=test` in the address. */
export function voiceTestEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).get('voice') === 'test';
}

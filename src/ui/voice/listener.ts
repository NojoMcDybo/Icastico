/**
 * The microphone side of the record button: listens without a key held, cuts out every spoken word and hands it
 * to the recogniser (Vosk with the word list). While something is playing, words are ignored – the speakers
 * would otherwise be understood as commands.
 */
import { createCommandEngine, type VoiceEngine } from './engines';
import { Recorder } from './recorder';
import { SpeechSegmenter } from './vad';

export class VoiceListener {
  private engine: VoiceEngine | null = null;
  private recorder: Recorder | null = null;
  /** Words waiting for the recogniser; a long queue (someone talking on) is cut short. */
  private waiting = 0;

  constructor(
    private readonly onHeard: (text: string, confidence: number) => void,
    private readonly status: (message: string) => void,
    private readonly mayListen: () => boolean,
  ) {}

  /** Opens the microphone and loads the model the first time (a few seconds). Throws with a readable message. */
  async start(): Promise<void> {
    const recorder = new Recorder();
    await recorder.open();
    this.recorder = recorder;
    if (!this.engine) {
      const engine = createCommandEngine();
      await engine.load(this.status);
      this.engine = engine;
    }
    const segmenter = new SpeechSegmenter();
    recorder.onBlock = (block, rate) => {
      const word = segmenter.feed(block, rate);
      if (word && this.mayListen() && this.waiting < 3) void this.recognize(word, rate);
    };
  }

  private async recognize(word: Float32Array, rate: number): Promise<void> {
    const engine = this.engine;
    if (!engine) return;
    this.waiting++;
    try {
      const heard = await engine.recognize(word, rate);
      // With a word list the recogniser answers "[unk]" for everything else (talk, noise): that is not worth a message.
      const text = heard.text.replace(/\[unk\]/g, '').trim();
      if (text && this.recorder) this.onHeard(text, heard.confidence);
    } catch (err) {
      this.status(`Spracherkennung: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.waiting--;
    }
  }

  /** Closes the microphone; the loaded model stays for the next time. */
  stop(): void {
    this.recorder?.close();
    this.recorder = null;
  }
}

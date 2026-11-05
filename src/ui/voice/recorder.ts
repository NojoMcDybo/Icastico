/**
 * Microphone recording for the voice test: the stream stays open while the dialog is open, so pressing the key
 * starts without delay; a quarter second before the key press is kept so the start of the word is not cut off.
 */
const PRE_ROLL_SECONDS = 0.25;

export class Recorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private recording = false;
  /** Called for every block with its loudness 0–1 (for a level meter). */
  onLevel: (level: number) => void = () => undefined;
  /** Called with every block as it comes in (the record button cuts words out of this). */
  onBlock: (block: Float32Array, rate: number) => void = () => undefined;

  /** Asks for the microphone (the first time the system asks the user). Throws with a readable message. */
  async open(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieses Fenster kann kein Mikrofon benutzen.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      throw new Error(name === 'NotFoundError' ? 'Es ist kein Mikrofon angeschlossen.' : 'Das Mikrofon ist nicht erlaubt. Bitte in den Datenschutzeinstellungen des Systems für Icastico freigeben.');
    }
    const context = new AudioContext();
    this.context = context;
    const source = context.createMediaStreamSource(this.stream);
    const node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => {
      const block = new Float32Array(event.inputBuffer.getChannelData(0));
      let sum = 0;
      for (const v of block) sum += v * v;
      this.onLevel(Math.min(1, Math.sqrt(sum / block.length) * 4));
      this.onBlock(block, context.sampleRate);
      this.chunks.push(block);
      this.length += block.length;
      if (!this.recording) {
        const keep = Math.ceil(PRE_ROLL_SECONDS * context.sampleRate);
        while (this.chunks.length > 1 && this.length - this.chunks[0]!.length >= keep) this.length -= this.chunks.shift()!.length;
      }
    };
    source.connect(node);
    node.connect(context.destination); // a script processor only runs when connected; it outputs silence
  }

  begin(): void {
    this.recording = true;
  }

  /** Ends the recording and returns it with the rate of the microphone. */
  end(): { samples: Float32Array; rate: number } {
    this.recording = false;
    const samples = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.length = 0;
    return { samples, rate: this.context?.sampleRate ?? 48000 };
  }

  close(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
  }
}

/**
 * Cuts a running microphone signal into spoken words (the record button listens without a key held):
 * a word starts when the signal gets clearly louder than the room, and ends after a short pause.
 * Pure logic on blocks of samples, so it can be tested with made-up signals.
 */
const PRE_ROLL = 0.25; // seconds kept from before the word, so its start is not cut off
const END_SILENCE = 0.45; // seconds of quiet that end a word
const MIN_WORD = 0.12;
const MAX_WORD = 3;
/** Never trigger below this loudness, however quiet the room (RMS 0–1). */
const FLOOR = 0.02;

const rms = (block: Float32Array): number => {
  let sum = 0;
  for (const v of block) sum += v * v;
  return Math.sqrt(sum / block.length);
};

export class SpeechSegmenter {
  private noise = 0.005;
  private recent: Float32Array[] = [];
  private recentLength = 0;
  private word: Float32Array[] | null = null;
  private wordLength = 0;
  private quiet = 0;
  private loudTime = 0;

  /** Feeds the next block; returns the finished word (all samples, with pre-roll) when one just ended. */
  feed(block: Float32Array, rate: number): Float32Array | null {
    const level = rms(block);
    const loud = level > Math.max(FLOOR, this.noise * 3);
    const seconds = block.length / rate;
    if (!this.word) {
      if (!loud) this.noise = this.noise * 0.95 + level * 0.05; // learns how loud the room is
      this.recent.push(block);
      this.recentLength += block.length;
      while (this.recent.length > 1 && this.recentLength - this.recent[0]!.length >= PRE_ROLL * rate) this.recentLength -= this.recent.shift()!.length;
      if (!loud) return null;
      this.word = [...this.recent];
      this.wordLength = this.recentLength;
      this.recent = [];
      this.recentLength = 0;
      this.quiet = 0;
      this.loudTime = seconds;
      return null;
    }
    this.word.push(block);
    this.wordLength += block.length;
    this.quiet = loud ? 0 : this.quiet + seconds;
    if (loud) this.loudTime += seconds;
    if (this.quiet < END_SILENCE && this.wordLength / rate < MAX_WORD) return null;
    const samples = new Float32Array(this.wordLength);
    let offset = 0;
    for (const b of this.word) {
      samples.set(b, offset);
      offset += b.length;
    }
    this.word = null;
    return this.loudTime >= MIN_WORD ? samples : null; // a click is not a word
  }
}

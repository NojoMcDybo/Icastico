/**
 * Small audio helpers for the voice test: resampling to the 16 kHz the recognisers want, 16-bit WAV in and out
 * (the recordings are saved with the test result so a recogniser can be tried again without speaking again).
 */

export const RECOGNISER_RATE = 16000;

/** Mono samples at `from` Hz → `to` Hz. Averages when shrinking, so high tones do not fold back as noise. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const length = Math.max(1, Math.floor((samples.length * to) / from));
  const out = new Float32Array(length);
  const step = from / to;
  for (let i = 0; i < length; i++) {
    const start = i * step;
    const end = Math.min(samples.length, start + Math.max(step, 1));
    let sum = 0;
    let count = 0;
    for (let j = Math.floor(start); j < Math.ceil(end); j++) {
      sum += samples[j]!;
      count++;
    }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

const ascii = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

/** 16-bit mono WAV file. */
export function toWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  ascii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(view, 8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** The samples of a 16-bit PCM WAV file (first channel). Throws for anything else. */
export function fromWav(bytes: Uint8Array): { samples: Float32Array; rate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Keine WAV-Datei');
  let offset = 12;
  let rate = 0;
  let channels = 1;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === 'fmt ') {
      if (view.getUint16(offset + 8, true) !== 1 || view.getUint16(offset + 22, true) !== 16) throw new Error('Nur 16-Bit-WAV wird gelesen');
      channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true);
    } else if (tag(offset) === 'data') {
      const frames = Math.floor(Math.min(size, bytes.length - offset - 8) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = view.getInt16(offset + 8 + i * 2 * channels, true) / 0x8000;
      return { samples, rate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV-Datei ohne Audiodaten');
}

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

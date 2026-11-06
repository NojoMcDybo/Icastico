/**
 * WAV and AIFF (uncompressed) → mono samples. Logic exports these two; reading them here keeps the
 * common case independent of what the system can decode (MP3, M4A and the like go through the browser, see platform/audio.ts).
 */
import { ImportError } from './musicxml';

export interface Samples {
  readonly rate: number;
  /** Mono, −1 … 1. */
  readonly data: Float32Array;
}

/** Sample rates a real recording can have; anything else is a damaged header. */
const plausibleRate = (rate: number): boolean => Number.isFinite(rate) && rate >= 1000 && rate <= 768000;

const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** Mixes interleaved frames down to one channel. `read(frame, channel)` returns one sample in −1 … 1. */
function mixDown(frames: number, channels: number, read: (frame: number, channel: number) => number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(i, c);
    out[i] = sum / channels;
  }
  return out;
}

function pcmReader(view: DataView, start: number, bits: number, channels: number, littleEndian: boolean, float: boolean): (frame: number, channel: number) => number {
  const width = bits / 8;
  return (frame, channel) => {
    const at = start + (frame * channels + channel) * width;
    if (float) return bits === 64 ? view.getFloat64(at, littleEndian) : view.getFloat32(at, littleEndian);
    switch (bits) {
      case 8:
        return littleEndian ? (view.getUint8(at) - 128) / 128 : view.getInt8(at) / 128;
      case 16:
        return view.getInt16(at, littleEndian) / 32768;
      case 24: {
        const b = [view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2)];
        const v = littleEndian ? b[0]! | (b[1]! << 8) | (b[2]! << 16) : b[2]! | (b[1]! << 8) | (b[0]! << 16);
        return (v & 0x800000 ? v - 0x1000000 : v) / 8388608;
      }
      default:
        return view.getInt32(at, littleEndian) / 2147483648;
    }
  };
}

export function decodeWav(bytes: Uint8Array): Samples {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let dataAt = -1;
  let dataLength = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = tag(bytes, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // extensible: the real format follows
    } else if (id === 'data') {
      dataAt = body;
      dataLength = Math.min(size, bytes.length - body);
      break;
    }
    at = body + size + (size % 2);
  }
  if (format === 0 || dataAt < 0 || channels < 1 || !plausibleRate(rate)) throw new ImportError('Die WAV-Datei ist beschädigt oder unvollständig.');
  const float = format === 3;
  if (format !== 1 && !float) throw new ImportError('Diese WAV-Datei ist komprimiert. Bitte in Logic als unkomprimiertes WAV oder AIFF sichern.');
  if (float ? bits !== 32 && bits !== 64 : ![8, 16, 24, 32].includes(bits)) throw new ImportError(`WAV mit ${bits} Bit wird nicht gelesen.`);
  const frames = Math.floor(dataLength / (channels * (bits / 8)));
  return { rate, data: mixDown(frames, channels, pcmReader(view, dataAt, bits, channels, true, float)) };
}

/** The 80-bit extended number AIFF uses for the sample rate. */
function extended(view: DataView, at: number): number {
  const exponent = view.getUint16(at) & 0x7fff;
  const mantissa = view.getUint32(at + 2) * 2 ** 32 + view.getUint32(at + 6);
  return mantissa * 2 ** (exponent - 16383 - 63);
}

export function decodeAiff(bytes: Uint8Array): Samples {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const compressed = tag(bytes, 8) === 'AIFC';
  let channels = 0;
  let frames = 0;
  let bits = 0;
  let rate = 0;
  let little = false;
  let dataAt = -1;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = tag(bytes, at);
    const size = view.getUint32(at + 4);
    const body = at + 8;
    if (id === 'COMM' && body + 18 <= bytes.length) {
      channels = view.getUint16(body);
      frames = view.getUint32(body + 2);
      bits = view.getUint16(body + 6);
      rate = Math.round(extended(view, body + 8));
      if (compressed) {
        const kind = tag(bytes, body + 18);
        if (kind === 'sowt') little = true;
        else if (kind !== 'NONE' && kind !== 'twos') throw new ImportError('Diese AIFF-Datei ist komprimiert. Bitte in Logic als unkomprimiertes AIFF oder WAV sichern.');
      }
    } else if (id === 'SSND' && body + 8 <= bytes.length) {
      dataAt = body + 8 + view.getUint32(body);
      break;
    }
    at = body + size + (size % 2);
  }
  if (dataAt < 0 || dataAt > bytes.length || channels < 1 || !plausibleRate(rate)) throw new ImportError('Die AIFF-Datei ist beschädigt oder unvollständig.');
  if (![8, 16, 24, 32].includes(bits)) throw new ImportError(`AIFF mit ${bits} Bit wird nicht gelesen.`);
  const available = Math.floor((bytes.length - dataAt) / (channels * (bits / 8)));
  return { rate, data: mixDown(Math.min(frames, available), channels, pcmReader(view, dataAt, bits, channels, little, false)) };
}

/** WAV or AIFF by its header; null if the bytes are something else. */
export function decodePcm(bytes: Uint8Array): Samples | null {
  if (bytes.length < 12) return null;
  const outer = tag(bytes, 0);
  const inner = tag(bytes, 8);
  if (outer === 'RIFF' && inner === 'WAVE') return decodeWav(bytes);
  if (outer === 'FORM' && (inner === 'AIFF' || inner === 'AIFC')) return decodeAiff(bytes);
  return null;
}

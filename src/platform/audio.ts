/**
 * Recordings the app cannot read itself (MP3, M4A, FLAC, OGG) are decoded by the system's audio decoder.
 * WAV and AIFF never come here (core/import/wav.ts reads them).
 */
import { ImportError } from '../core/import/musicxml';
import type { Samples } from '../core/import/wav';

export async function decodeWithSystem(bytes: Uint8Array): Promise<Samples> {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new ImportError('Dieses Programm kann hier keine Tonaufnahmen dekodieren. Bitte als WAV oder AIFF exportieren.');
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(bytes.slice().buffer);
    const data = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i]! += channel[i]! / buffer.numberOfChannels;
    }
    return { rate: buffer.sampleRate, data };
  } catch {
    throw new ImportError('Diese Audiodatei konnte nicht gelesen werden. Am sichersten ist in Logic „Sichern als …“ → WAV oder AIFF.');
  } finally {
    void context.close();
  }
}

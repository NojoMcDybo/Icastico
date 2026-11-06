/**
 * Guesses the key signature from the notes (Krumhansl–Schmuckler): the pitch-class histogram is compared
 * with the typical profile of every major and minor key. Returns the signature on the circle of fifths
 * (a minor key gives the signature of its relative major).
 */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Signature of the major key on pitch class `tonic` (0 = C): 7 per step of fifths, folded to −5 … 6. */
export function fifthsOfMajor(tonic: number): number {
  const f = (((tonic * 7) % 12) + 12) % 12;
  return f > 6 ? f - 12 : f;
}

export function estimateKey(notes: readonly { midi: number; weight: number }[]): number {
  const histogram = new Array<number>(12).fill(0);
  for (const n of notes) histogram[((Math.round(n.midi) % 12) + 12) % 12]! += n.weight;
  let best = { score: -Infinity, fifths: 0 };
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotate = (profile: readonly number[]) => histogram.map((_, pc) => profile[(pc - tonic + 12) % 12]!);
    const major = correlation(histogram, rotate(MAJOR));
    const minor = correlation(histogram, rotate(MINOR));
    if (major > best.score) best = { score: major, fifths: fifthsOfMajor(tonic) };
    if (minor > best.score) best = { score: minor, fifths: fifthsOfMajor((tonic + 3) % 12) };
  }
  return best.fifths;
}

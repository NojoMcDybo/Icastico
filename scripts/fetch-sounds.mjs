// Fetches the instrument sounds (MuseScore_General.sf3, MIT license, ~40 MB) into public/sounds.
// The file is not kept in git: `npm run dev` and `npm run build` call this first, and it does
// nothing when the file is already there and matches the pinned checksum.
//   npm run sounds
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const URL_SF3 = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3';
const SHA256 = '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds');
const target = join(dir, 'MuseScore_General.sf3');

async function sha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

if (existsSync(target) && (await sha256(target)) === SHA256) process.exit(0);

mkdirSync(dir, { recursive: true });
console.log('Lade Instrumentenklänge (MuseScore_General.sf3, ca. 40 MB) …');
const response = await fetch(URL_SF3);
if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen: HTTP ${response.status}`);
const part = `${target}.part`;
await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
if ((await sha256(part)) !== SHA256) {
  rmSync(part);
  throw new Error('Die heruntergeladene Klangdatei hat eine unerwartete Prüfsumme – abgebrochen.');
}
renameSync(part, target);
console.log('Fertig.');

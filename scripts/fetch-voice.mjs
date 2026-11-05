// Fetches the speech model for the voice test (Vosk small German 0.15, Apache-2.0, ~46 MB) into public/voice.
// The file is not kept in git: `npm run dev` and `npm run build` call this first, and it does
// nothing when the file is already there and matches the pinned checksum.
//   npm run voice
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const URL_MODEL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-de-0.15.tar.gz';
const SHA256 = 'dc500ec4e8176b68ab12037ce6b19de6ce8c23f916d90b6be86f7b22633dd430';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'voice');
const target = join(dir, 'vosk-model-small-de-0.15.tar.gz');

async function sha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

if (existsSync(target) && (await sha256(target)) === SHA256) process.exit(0);

mkdirSync(dir, { recursive: true });
console.log('Lade das Sprachmodell (vosk-model-small-de-0.15, ca. 46 MB) …');
const response = await fetch(URL_MODEL);
if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen: HTTP ${response.status}`);
const part = `${target}.part`;
await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
if ((await sha256(part)) !== SHA256) {
  rmSync(part);
  throw new Error('Das heruntergeladene Sprachmodell hat eine unerwartete Prüfsumme – abgebrochen.');
}
renameSync(part, target);
console.log('Fertig.');

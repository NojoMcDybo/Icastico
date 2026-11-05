// Tries the speech recognisers on recordings, without a microphone (plan "Sprachbefehle", package 3).
//   node scripts/voice-eval.mjs <folder>        folder with words.json (the spoken words, in order) and 00.wav, 01.wav …
//   node scripts/voice-eval.mjs <result.json>   a result file saved by the voice test dialog (it contains the recordings)
// Prints, per recogniser, how many words were understood right, wrong, or not at all.
// Playwright is not a project dependency (Claude's environment provides it globally).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');

const input = resolve(process.argv[2] ?? '');
if (!existsSync(input)) {
  console.error('Aufruf: node scripts/voice-eval.mjs <Ordner mit words.json + WAV | Ergebnisdatei.json>');
  process.exit(1);
}

/** [{ word, wav (base64) }] */
let clips;
if (statSync(input).isDirectory()) {
  const words = JSON.parse(readFileSync(join(input, 'words.json'), 'utf8'));
  clips = words.map((word, i) => ({ word, wav: readFileSync(join(input, `${String(i).padStart(2, '0')}.wav`)).toString('base64') }));
  if (readdirSync(input).filter((f) => f.endsWith('.wav')).length !== words.length) throw new Error('Anzahl der WAV-Dateien und Wörter passt nicht');
} else {
  const file = JSON.parse(readFileSync(input, 'utf8'));
  if (file.format !== 'icastico-sprachtest') throw new Error('Das ist keine Sprachtest-Datei');
  clips = file.words.filter((w) => w.clip).map((w) => ({ word: w.word, wav: w.clip }));
}

const server = await createServer({ logLevel: 'error', server: { port: 1431, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Seitenfehler:', e.message));
  await page.goto(url);
  const report = await page.evaluate(async (clips) => {
    const { createEngines } = await import('/src/ui/voice/engines.ts');
    const { fromBase64, fromWav } = await import('/src/ui/voice/audio.ts');
    const { judge, summarize, testWords } = await import('/src/ui/voice/evaluate.ts');
    const byWord = new Map(testWords().map((t) => [t.word, t.entry]));
    const engines = createEngines();
    for (const e of engines) await e.load(() => undefined);
    const out = {};
    for (const engine of engines) {
      const rows = [];
      for (const clip of clips) {
        const { samples, rate } = fromWav(fromBase64(clip.wav));
        const heard = await engine.recognize(samples, rate);
        rows.push({ word: clip.word, heard: heard.text, confidence: Math.round(heard.confidence * 100) / 100, ms: heard.ms, verdict: judge(byWord.get(clip.word), heard) });
      }
      out[engine.name] = { rows, summary: summarize(rows) };
      engine.dispose();
    }
    return out;
  }, clips);

  for (const [name, { rows, summary }] of Object.entries(report)) {
    console.log(`\n== ${name} ==`);
    for (const r of rows) if (r.verdict !== 'richtig') console.log(`  ${r.verdict.padEnd(16)} gesagt „${r.word}“ → gehört „${r.heard}“ (${r.confidence})`);
    const pct = (x) => `${(x * 100).toFixed(1)} %`;
    console.log(`  richtig ${summary.richtig}/${summary.total} (${pct(summary.trefferquote)}) · falsch ${summary.falsch} (${pct(summary.fehlerquote)}) · nicht verstanden ${summary.nichtVerstanden} · mittlere Dauer ${summary.meanMs} ms`);
  }
} finally {
  await browser.close();
  await server.close();
}

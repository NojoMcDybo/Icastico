/**
 * Reads the bytes of a MusicXML file: plain `.musicxml` / `.xml`, or the compressed `.mxl`
 * (a zip whose META-INF/container.xml names the score file). Returns the XML text.
 */
import { strFromU8, unzipSync } from 'fflate';
import { ImportError } from './musicxml';
import { child, childrenNamed, parseXml } from './xml';

const isZip = (b: Uint8Array): boolean => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

export function musicXmlText(bytes: Uint8Array): string {
  if (!isZip(bytes)) return decode(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError('Die komprimierte MusicXML-Datei (.mxl) lässt sich nicht entpacken.');
  }
  let path: string | undefined;
  const container = files['META-INF/container.xml'];
  if (container) {
    const rootfiles = child(parseXml(strFromU8(container)), 'rootfiles');
    path = rootfiles ? childrenNamed(rootfiles, 'rootfile')[0]?.attrs['full-path'] : undefined;
  }
  path ??= Object.keys(files).find((n) => !n.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(n));
  const score = path ? files[path] : undefined;
  if (!score) throw new ImportError('In der .mxl-Datei steckt keine Partitur.');
  return decode(score);
}

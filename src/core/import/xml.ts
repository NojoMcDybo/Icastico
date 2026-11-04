/**
 * A small XML reader for imports: no DOM, so it runs in the app, in tests and anywhere else.
 * It reads well-formed documents (what music programs write): elements, attributes, text,
 * entities, CDATA; comments, processing instructions and the DOCTYPE are skipped.
 */
export interface XmlElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** Text directly inside the element (trimmed, parts joined). */
  readonly text: string;
}

export class XmlError extends Error {
  override readonly name = 'XmlError';
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });

interface Open {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string[];
}

/** Parses a document and returns its root element. */
export function parseXml(source: string): XmlElement {
  const s = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const stack: Open[] = [];
  let root: XmlElement | null = null;
  let i = 0;
  const fail = (why: string): never => {
    throw new XmlError(`Kein gültiges XML (${why} bei Zeichen ${i}).`);
  };
  const skipTo = (marker: string): void => {
    const end = s.indexOf(marker, i);
    if (end < 0) fail(`„${marker}“ fehlt`);
    i = end + marker.length;
  };
  const close = (): void => {
    const o = stack.pop()!;
    const el: XmlElement = { name: o.name, attrs: o.attrs, children: o.children, text: o.text.join('').trim() };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else root = el;
  };

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i && stack.length > 0) stack[stack.length - 1]!.text.push(decode(s.slice(i, lt)));
    i = lt;
    if (s.startsWith('<!--', i)) skipTo('-->');
    else if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i);
      if (end < 0) fail('CDATA ohne Ende');
      stack[stack.length - 1]?.text.push(s.slice(i + 9, end));
      i = end + 3;
    } else if (s.startsWith('<?', i)) skipTo('?>');
    else if (s.startsWith('<!', i)) {
      // DOCTYPE, possibly with an internal subset in [...]
      let depth = 0;
      for (i += 2; i < s.length; i++) {
        const c = s[i];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i++;
    } else if (s.startsWith('</', i)) {
      const end = s.indexOf('>', i);
      if (end < 0) fail('„>“ fehlt');
      const name = s.slice(i + 2, end).trim();
      if (stack.length === 0 || stack[stack.length - 1]!.name !== name) fail(`unerwartetes Ende von <${name}>`);
      close();
      i = end + 1;
    } else {
      // start tag
      const m = /^<([^\s/>]+)/.exec(s.slice(i, i + 200));
      if (!m) fail('ungültiges Tag');
      const name = m![1]!;
      i += m![0].length;
      const attrs: Record<string, string> = {};
      for (;;) {
        while (/\s/.test(s[i] ?? '')) i++;
        if (s[i] === '/' && s[i + 1] === '>') {
          stack.push({ name, attrs, children: [], text: [] });
          close();
          i += 2;
          break;
        }
        if (s[i] === '>') {
          stack.push({ name, attrs, children: [], text: [] });
          i++;
          break;
        }
        const a = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(s.slice(i, i + 2000));
        if (!a) fail(`Attribut in <${name}> unlesbar`);
        attrs[a![1]!] = decode(a![3] ?? a![4] ?? '');
        i += a![0].length;
      }
    }
  }
  if (stack.length > 0) fail(`<${stack[stack.length - 1]!.name}> wurde nicht geschlossen`);
  if (!root) fail('kein Wurzelelement');
  return root!;
}

/** First child with this name. */
export const child = (el: XmlElement, name: string): XmlElement | undefined => el.children.find((c) => c.name === name);

/** All children with this name. */
export const childrenNamed = (el: XmlElement, name: string): XmlElement[] => el.children.filter((c) => c.name === name);

/** Text of the first child with this name. */
export const childText = (el: XmlElement, name: string): string | undefined => child(el, name)?.text;

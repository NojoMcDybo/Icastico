import { describe, expect, it } from 'vitest';
import { applyTabNumbers, trimRepeatDots } from './tab';

describe('dotted notes and repeat signs in tablature (ADR 0046)', () => {
  const note = `<g id="a" class="note">
 <g class="notehead"><use xlink:href="#E0A4" transform="translate(100, 200) scale(1,1)" /></g>
 <g id="d1" class="dots"><ellipse cx="4659" cy="8949" rx="36" ry="36" /></g>
</g>
<g id="b" class="note"><g id="d2" class="dots"><ellipse cx="9" cy="9" rx="36" ry="36" /></g></g>`;

  it('the dot of a dotted note is drawn right behind the number, level with it', () => {
    const out = applyTabNumbers(note, new Map([['a', '3']]));
    expect(out).toContain('class="tabnumber">3<');
    expect(out).not.toContain('cx="4659"');
    const dot = /<circle cx="(\d+)" cy="(\d+)" r="38" class="tabdot"/.exec(out)!;
    expect(Number(dot[2])).toBe(200); // the string line
    expect(Number(dot[1])).toBeGreaterThan(100 + 108 + 100); // right of the patch of the number
    expect(out).toContain('id="d2"'); // the next note keeps its own dots
  });

  it('a note without a dot gets none', () => {
    expect(applyTabNumbers(note.replace(/<g id="d1"[^\n]*\n/, ''), new Map([['a', '3']]))).not.toContain('tabdot');
  });

  it('a double dot makes two dots', () => {
    const two = note.replace('<ellipse cx="4659" cy="8949" rx="36" ry="36" />', '<ellipse cx="4659" cy="8949" rx="36" ry="36" /><ellipse cx="4800" cy="8949" rx="36" ry="36" />');
    expect(applyTabNumbers(two, new Map([['a', '3']])).match(/class="tabdot"/g)).toHaveLength(2);
  });

  it('three repeat dots become two: the middle one goes', () => {
    const dot = (y: number) => `<use xlink:href="#E044-x" transform="translate(3266, ${y}) scale(0.72, 0.72)" />`;
    const svg = `<g class="barLine">${dot(5424)}${dot(5604)}${dot(5784)}</g>`;
    const out = trimRepeatDots(svg);
    expect(out).toContain('5424');
    expect(out).toContain('5784');
    expect(out).not.toContain('5604');
  });

  it('the two dots of a five-line staff stay', () => {
    const dot = (y: number) => `<use xlink:href="#E044-x" transform="translate(3266, ${y}) scale(0.72, 0.72)" />`;
    const svg = `<g class="barLine">${dot(1824)}${dot(2004)}<path d="M1 2 L3 4" />${dot(3624)}${dot(3804)}</g>`;
    expect(trimRepeatDots(svg)).toBe(svg);
  });
});

import { describe, expect, it } from 'vitest';
import { frac, fracToString } from '../core/time';
import { createEditorState } from '../core/editor/state';
import { applyRollEdit } from '../core/editor/rollEdits';
import { emptyScore } from '../core/templates';
import {
  type BarRef,
  contentWidth,
  dragChange,
  drawChange,
  layoutFor,
  midiAtY,
  octaveLabel,
  scrollTarget,
  snapDelta,
  snapTime,
  xOfTime,
  yOfMidi,
  zoneOf,
} from './pianoRollGeometry';

const VOICE = { partId: 'voice', voiceId: 'voice-v1' };
const layout = layoutFor(emptyScore(), VOICE);
const S = fracToString;
const sixteenth = frac(1, 16);
const bar: BarRef = { eventId: 'e', toneId: 't', onset: frac(1, 4), duration: frac(1, 4), midi: 72 };

describe('piano roll geometry', () => {
  it('maps time and pitch to pixels and back', () => {
    expect(xOfTime(layout, frac(1, 4)) - xOfTime(layout, frac(0))).toBe(layout.pxPerWhole / 4);
    expect(S(snapTime(layout, xOfTime(layout, frac(3, 8)) + 1, sixteenth))).toBe('3/8');
    expect(midiAtY(layout, yOfMidi(layout, 64) + 3)).toBe(64);
    expect(midiAtY(layout, -50)).toBe(layout.highMidi);
    expect(midiAtY(layout, 1e6)).toBe(layout.lowMidi);
  });

  it('snaps times to the chosen grid and never before the start', () => {
    expect(S(snapTime(layout, 0, sixteenth))).toBe('0');
    expect(S(snapTime(layout, xOfTime(layout, frac(1, 4)) + layout.pxPerWhole / 32, frac(1, 8)))).toBe('1/4');
    expect(S(snapDelta(layout, layout.pxPerWhole / 4 + 3, sixteenth))).toBe('1/4');
    expect(S(snapDelta(layout, -layout.pxPerWhole / 16, sixteenth))).toBe('-1/16');
  });

  it('the roll covers the whole last measure and the instrument range', () => {
    expect(contentWidth(layout)).toBe(xOfTime(layout, layout.totalTime));
    expect(layout.lowMidi).toBeLessThan(layout.highMidi);
    const guitar = layoutFor(
      { ...emptyScore(), parts: emptyScore().parts.map((p) => ({ ...p, instrument: 'guitar' as const })) },
      VOICE,
    );
    expect(guitar.lowMidi).toBe(40 - 2); // E2 sounding – the roll shows concert pitch, not the written octave
  });

  it('a tone below the instrument range still gets a row', () => {
    let s = createEditorState(emptyScore());
    s = applyRollEdit(s, { kind: 'create', voice: VOICE, onset: frac(0), duration: frac(1, 4), midi: 30 });
    expect(layoutFor(s.score, VOICE).lowMidi).toBe(28);
  });

  it('edge zones: narrow bars still have a body', () => {
    expect(zoneOf(100, 200, 102)).toBe('start');
    expect(zoneOf(100, 200, 198)).toBe('end');
    expect(zoneOf(100, 200, 150)).toBe('body');
    expect(zoneOf(100, 109, 104)).toBe('body');
  });

  it('dragging the body moves in grid steps and in semitone rows', () => {
    const c = dragChange(layout, 'body', bar, layout.pxPerWhole / 8 + 2, -layout.rowHeight * 2 - 3, sixteenth);
    expect(S(c.onset!)).toBe('3/8');
    expect(c.midi).toBe(74);
    expect(dragChange(layout, 'body', bar, 0, 0, sixteenth).midi).toBeUndefined();
  });

  it('pulling the end changes only the length and keeps at least one grid step', () => {
    expect(S(dragChange(layout, 'end', bar, layout.pxPerWhole / 4, 0, sixteenth).duration!)).toBe('1/2');
    expect(S(dragChange(layout, 'end', bar, -layout.pxPerWhole, 0, sixteenth).duration!)).toBe('1/16');
  });

  it('pulling the start keeps the end fixed and stops before the end', () => {
    const c = dragChange(layout, 'start', bar, layout.pxPerWhole / 8, 0, sixteenth);
    expect(S(c.onset!)).toBe('3/8');
    expect(S(c.duration!)).toBe('1/8');
    const far = dragChange(layout, 'start', bar, layout.pxPerWhole, 0, sixteenth);
    expect(S(far.onset!)).toBe('7/16');
    expect(S(far.duration!)).toBe('1/16');
  });

  it('drawing: start on the grid line left of the pointer, at least one step long', () => {
    const down = xOfTime(layout, frac(3, 16)) + 3;
    const same = drawChange(layout, down, yOfMidi(layout, 67) + 2, down, sixteenth);
    expect(S(same.onset)).toBe('3/16');
    expect(S(same.duration)).toBe('1/16');
    expect(same.midi).toBe(67);
    const dragged = drawChange(layout, down, yOfMidi(layout, 67), xOfTime(layout, frac(1, 2)), sixteenth);
    expect(S(dragged.duration)).toBe('5/16');
  });

  it('scrolls only when the bar is not fully visible', () => {
    expect(scrollTarget(0, 500, 100, 200)).toBeNull();
    expect(scrollTarget(300, 500, 100, 200)).toBe(76);
    expect(scrollTarget(0, 500, 480, 600)).toBe(124);
  });

  it('labels only the C rows', () => {
    expect(octaveLabel(60)).toBe('C4');
    expect(octaveLabel(61)).toBeNull();
  });
});

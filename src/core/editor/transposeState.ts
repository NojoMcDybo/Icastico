/**
 * Transposing in the editor: what is moved (the marked passage, else the selected line, else the whole piece)
 * and the undoable change itself.
 */
import { type Fraction } from '../time';
import { type TransposeSpec, transposeScore } from '../transpose';
import { type EditorState } from './state';
import { rangeSpan } from './range';
import { withValidLinks } from './linkOps';

export interface TransposeScope {
  /** What the dialog says will be moved. */
  readonly label: string;
  readonly partId?: string;
  readonly from?: Fraction;
  readonly to?: Fraction;
  /** The whole piece moves: the key signature can move along. */
  readonly wholePiece: boolean;
}

export function transposeScope(s: EditorState): TransposeScope {
  const span = rangeSpan(s);
  if (span) return { label: `Markierter Bereich (${span.notes} ${span.notes === 1 ? 'Note' : 'Noten'})`, partId: span.partId, from: span.from, to: span.to, wholePiece: false };
  const ref = s.selection ?? s.caret;
  const part = ref ? s.score.parts.find((p) => p.id === ref.partId) : undefined;
  if (part && s.score.parts.length > 1) return { label: `Ganze Zeile „${part.name}“`, partId: part.id, wholePiece: false };
  return { label: 'Ganze Partitur', wholePiece: true };
}

export function transposeSelection(s: EditorState, spec: TransposeSpec): EditorState {
  const scope = transposeScope(s);
  const { score, notes } = transposeScore(s.score, spec, { ...(scope.partId !== undefined ? { partId: scope.partId } : {}), ...(scope.from ? { from: scope.from } : {}), ...(scope.to ? { to: scope.to } : {}) });
  if (notes === 0) return { ...s, message: 'Hier gibt es keine Noten zum Transponieren.' };
  const moved = withValidLinks(s, { ...s, score, message: `${notes} ${notes === 1 ? 'Ton' : 'Töne'} transponiert (${scope.label})` });
  return moved;
}

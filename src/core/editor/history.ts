/**
 * Undo/redo by keeping old immutable states. Only score changes create an
 * undo step; caret moves and selection changes do not.
 */
import type { EditorState } from './state';

const LIMIT = 500;

export class History {
  private past: EditorState[] = [];
  private future: EditorState[] = [];

  constructor(private current: EditorState) {}

  get state(): EditorState {
    return this.current;
  }

  apply(next: EditorState): void {
    if (next === this.current) return;
    if (next.score !== this.current.score) {
      this.past.push({ ...this.current, message: null });
      if (this.past.length > LIMIT) this.past.shift();
      this.future = [];
    }
    this.current = next;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) {
      this.current = { ...this.current, message: 'Nichts rückgängig zu machen.' };
      return;
    }
    this.future.push({ ...this.current, message: null });
    this.current = { ...prev, message: 'Rückgängig' };
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) {
      this.current = { ...this.current, message: 'Nichts wiederherzustellen.' };
      return;
    }
    this.past.push({ ...this.current, message: null });
    this.current = { ...next, message: 'Wiederhergestellt' };
  }
}

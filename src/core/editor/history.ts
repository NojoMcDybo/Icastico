/**
 * Undo/redo by keeping old immutable states. Only score changes create an
 * undo step; caret moves and selection changes do not.
 *
 * A gesture (a drag in a view) is many previews but ONE undo step: between
 * `beginGesture` and `commitGesture` nothing enters the undo list, and
 * `committed` still shows the last finished state (what autosave may write).
 */
import type { EditorState } from './state';

const LIMIT = 500;

interface Checkpoint {
  readonly current: EditorState;
  readonly past: EditorState[];
  readonly future: EditorState[];
}

export class History {
  private past: EditorState[] = [];
  private future: EditorState[] = [];
  private gesture: EditorState | null = null;
  private checkpoint: Checkpoint;

  constructor(private current: EditorState) {
    this.checkpoint = this.snapshot();
  }

  get state(): EditorState {
    return this.current;
  }

  /** The state without a running gesture's preview: what may be saved. */
  get committed(): EditorState {
    return this.gesture ?? this.current;
  }

  get inGesture(): boolean {
    return this.gesture !== null;
  }

  private snapshot(): Checkpoint {
    return { current: this.current, past: [...this.past], future: [...this.future] };
  }

  apply(next: EditorState): void {
    if (next === this.current) return;
    if (this.gesture) {
      this.current = next;
      return;
    }
    this.checkpoint = this.snapshot();
    if (next.score !== this.current.score) {
      this.past.push({ ...this.current, message: null });
      if (this.past.length > LIMIT) this.past.shift();
      this.future = [];
    }
    this.current = next;
  }

  /** Starts a gesture; previews go through `apply` and are not undoable one by one. */
  beginGesture(): void {
    if (this.gesture) return;
    this.gesture = this.current;
  }

  /** Ends the gesture: everything it changed becomes one undo step. */
  commitGesture(): void {
    const base = this.gesture;
    if (!base) return;
    this.gesture = null;
    const next = this.current;
    this.current = base;
    this.apply(next);
  }

  /** Ends the gesture and drops everything it previewed. */
  cancelGesture(): void {
    if (!this.gesture) return;
    this.current = this.gesture;
    this.gesture = null;
  }

  /**
   * Takes back the last `apply`/`undo`/`redo`, e.g. when a view cannot draw its
   * result. Unlike undo it never reaches further back, and it leaves no redo step.
   */
  rollback(): void {
    if (this.gesture) return this.cancelGesture();
    this.current = this.checkpoint.current;
    this.past = [...this.checkpoint.past];
    this.future = [...this.checkpoint.future];
  }

  undo(): void {
    if (this.gesture) return;
    const prev = this.past.pop();
    if (!prev) {
      this.current = { ...this.current, message: 'Nichts rückgängig zu machen.' };
      return;
    }
    this.checkpoint = { current: this.current, past: [...this.past, prev], future: [...this.future] };
    this.future.push({ ...this.current, message: null });
    this.current = { ...prev, message: 'Rückgängig' };
  }

  redo(): void {
    if (this.gesture) return;
    const next = this.future.pop();
    if (!next) {
      this.current = { ...this.current, message: 'Nichts wiederherzustellen.' };
      return;
    }
    this.checkpoint = { current: this.current, past: [...this.past], future: [...this.future, next] };
    this.past.push({ ...this.current, message: null });
    this.current = { ...next, message: 'Wiederhergestellt' };
  }
}

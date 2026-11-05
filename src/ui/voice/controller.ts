/**
 * Connects spoken words to the editor (plan "Sprachbefehle"): a heard word becomes the same command the key
 * would run, and the status line says what was understood. Unsure or unknown = nothing happens.
 */
import type { CommandId } from '../../core/editor/commands';
import type { VoiceSource } from '../../platform/voice';
import type { UiCommandId } from '../keymaps/library';
import { type VoiceMatch, matchVoiceSequence } from './matcher';
import { VOCABULARY_DE, type VoiceCommand } from './vocabulary.de';

export interface VoiceHost {
  run(command: CommandId | UiCommandId, arg: number): void;
  say(message: string): void;
  /** False while a dialog is open or there is no score: nothing is run then. */
  ready(): boolean;
}

export class VoiceController {
  constructor(
    private readonly host: VoiceHost,
    source: VoiceSource,
    private readonly vocabulary: readonly VoiceCommand[] = VOCABULARY_DE,
  ) {
    source.onHeard((heard) => this.hear(heard.text, heard.confidence));
  }

  /** Runs what was heard (one command, or several in one breath, e.g. dictated notes) and says what it was. */
  hear(text: string, confidence: number): VoiceMatch[] | null {
    if (!this.host.ready()) return null;
    const matches = matchVoiceSequence(text, confidence, this.vocabulary);
    if (!matches) {
      this.host.say(`nicht verstanden: „${text.trim()}“`);
      return null;
    }
    for (const match of matches) this.host.run(match.command, match.arg);
    this.host.say(`verstanden: ${text.trim()} → ${matches.map((m) => m.label).join(', ')}`);
    return matches;
  }
}

/** A text line instead of the microphone, for trying the commands without speaking. */
export function mountVoiceField(hear: (text: string) => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'voice-field';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Sprachbefehl tippen, Enter';
  input.setAttribute('aria-label', 'Sprachbefehl (Testfeld)');
  input.autocomplete = 'off';
  input.addEventListener('keydown', (e) => e.stopPropagation()); // typing words must not enter notes
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hear(input.value);
    input.value = '';
  });
  form.append(input);
  document.body.append(form);
  return form;
}

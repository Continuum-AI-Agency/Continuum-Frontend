import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, fireEvent, render } from '@testing-library/react';
import { appendDictation, DictationButton } from './DictationButton';

type Handler = ((event: unknown) => void) | null;

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  interimResults = true;
  continuous = true;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: (() => void) | null = null;
  start = mock(() => {});
  stop = mock(() => this.onend?.());
  abort = mock(() => {});
  constructor() {
    FakeRecognition.last = this;
  }
  say(transcript: string) {
    const result = Object.assign([{ transcript }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
    this.onend?.();
  }
}

const speech = window as unknown as { webkitSpeechRecognition?: unknown };

afterEach(() => {
  delete speech.webkitSpeechRecognition;
  FakeRecognition.last = null;
});

describe('DictationButton', () => {
  test('renders nothing where the browser has no recognizer', () => {
    const view = render(<DictationButton onTranscript={() => {}} />);
    expect(view.queryByRole('button')).toBeNull();
  });

  test('delivers the final transcript and stops listening', () => {
    speech.webkitSpeechRecognition = FakeRecognition;
    const onTranscript = mock((_text: string) => {});
    const view = render(<DictationButton onTranscript={onTranscript} />);
    fireEvent.click(view.getByRole('button', { name: 'Dictate' }));
    const recognizer = FakeRecognition.last;
    expect(recognizer?.start).toHaveBeenCalled();
    expect(recognizer?.interimResults).toBe(false);
    expect(view.getByRole('button', { name: 'Stop dictation' })).toBeTruthy();
    act(() => recognizer?.say(' stagger this animation '));
    expect(onTranscript).toHaveBeenCalledWith('stagger this animation');
    expect(view.getByRole('button', { name: 'Dictate' })).toBeTruthy();
  });
});

describe('appendDictation', () => {
  test('fills an empty prompt and appends to a typed one', () => {
    expect(appendDictation('', 'stagger this')).toBe('stagger this');
    expect(appendDictation('make it ', 'snappier')).toBe('make it snappier');
  });
});

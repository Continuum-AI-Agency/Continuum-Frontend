import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TextareaHTMLAttributes } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('@/components/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

afterAll(() => mock.restore());

import { CaptionCharCount, EditableCaption } from './EditableCaption';

describe('EditableCaption', () => {
  beforeEach(() => cleanup());

  it('renders read-only text and switches to an editable field on click', () => {
    render(<EditableCaption value="Hello world" onChange={mock()} platform="instagram" />);
    const read = screen.getByLabelText('Edit caption');
    expect(read.tagName).toBe('BUTTON');
    expect(read.textContent).toContain('Hello world');
    fireEvent.click(read);
    expect(screen.getByLabelText('Caption').tagName).toBe('TEXTAREA');
  });

  it('shows the placeholder + an add affordance when empty', () => {
    render(
      <EditableCaption
        value=""
        onChange={mock()}
        platform="instagram"
        placeholder="Write a caption…"
      />,
    );
    const read = screen.getByLabelText('Add a caption');
    expect(read.textContent).toContain('Write a caption…');
  });

  it('emits onChange as the user edits in place', () => {
    const onChange = mock();
    render(<EditableCaption value="Hi" onChange={onChange} platform="instagram" />);
    fireEvent.click(screen.getByLabelText('Edit caption'));
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Hi there' } });
    expect(onChange).toHaveBeenCalledWith('Hi there');
  });

  it('returns to read mode on blur', () => {
    render(<EditableCaption value="Hi" onChange={mock()} platform="instagram" />);
    fireEvent.click(screen.getByLabelText('Edit caption'));
    const field = screen.getByLabelText('Caption');
    fireEvent.blur(field);
    expect(screen.getByLabelText('Edit caption').tagName).toBe('BUTTON');
  });

  // The preview's second Escape reached nothing: the field unmounted with focus in it, so
  // focus fell to <body>, outside every handler that closes the preview.
  it('hands focus back to the Edit caption button when Escape leaves the field', () => {
    render(<EditableCaption value="Hi" onChange={mock()} platform="instagram" />);
    fireEvent.click(screen.getByLabelText('Edit caption'));
    const field = screen.getByLabelText('Caption');
    act(() => field.focus());

    const escape = fireEvent.keyDown(field, { key: 'Escape' });

    expect(escape).toBe(false);
    const readout = screen.getByLabelText('Edit caption');
    expect(document.activeElement).toBe(readout);
  });

  it('leaves focus where a pointer put it when the field blurs', () => {
    render(
      <>
        <EditableCaption value="Hi" onChange={mock()} platform="instagram" />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByLabelText('Edit caption'));
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    act(() => screen.getByLabelText('Caption').focus());
    act(() => elsewhere.focus());

    expect(screen.getByLabelText('Edit caption').tagName).toBe('BUTTON');
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe('CaptionCharCount', () => {
  beforeEach(() => cleanup());

  // The live bug: this counter had its own limits map (linkedin 3000) while the publish
  // path clamped every platform at 2200. Both now read the same capability block.
  it('counts against the platform ceiling, not Instagram everywhere', () => {
    render(<CaptionCharCount caption="abc" platform="linkedin" />);
    expect(screen.getByText('3 / 3,000')).toBeTruthy();

    cleanup();
    render(<CaptionCharCount caption="abc" platform="instagram" />);
    expect(screen.getByText('3 / 2,200')).toBeTruthy();

    cleanup();
    render(<CaptionCharCount caption="abc" platform="facebook" />);
    expect(screen.getByText('3 / 63,206')).toBeTruthy();
  });

  it('falls back to the tightest ceiling for a platform we cannot publish to', () => {
    render(<CaptionCharCount caption="abc" platform="tiktok" />);
    expect(screen.getByText('3 / 2,200')).toBeTruthy();
  });

  it('only flags over-limit at the platform ceiling — 2,600 chars is fine on LinkedIn', () => {
    const caption = 'a'.repeat(2600);
    render(<CaptionCharCount caption={caption} platform="linkedin" />);
    expect(screen.getByText('2,600 / 3,000').className).not.toContain('text-destructive');

    cleanup();
    render(<CaptionCharCount caption={caption} platform="instagram" />);
    expect(screen.getByText('2,600 / 2,200').className).toContain('text-destructive');
  });
});

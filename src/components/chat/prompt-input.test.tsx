import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PromptInput } from './prompt-input';
import type { ChatAttachmentsController } from './useChatAttachments';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= TestResizeObserver as unknown as typeof ResizeObserver;

afterEach(cleanup);

function attachmentController(add = mock(), addInlineText = mock()): ChatAttachmentsController {
  return {
    files: [],
    add,
    addInlineText,
    remove: mock(),
    clear: mock(),
    retry: mock(async () => {}),
    isUploading: false,
    hasErrors: false,
    scopeKey: 'test-scope',
  };
}

function pasteText(editor: HTMLElement, text: string): boolean {
  return fireEvent.paste(editor, {
    clipboardData: {
      files: [],
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
}

describe('PromptInput pasted text attachments', () => {
  it.each([
    ['multiline text', 'First line\nSecond line'],
    ['text over 280 characters', 'a'.repeat(281)],
  ])('adds %s as ready inline context instead of uploading a document', (_label, text) => {
    const add = mock();
    const addInlineText = mock();
    render(
      <PromptInput
        attachments={attachmentController(add, addInlineText)}
        inlinePastedText
        onSubmit={mock()}
      />,
    );

    const editor = screen.getByRole('textbox');
    expect(pasteText(editor, text)).toBe(false);

    expect(editor.textContent).toBe('');
    expect(addInlineText).toHaveBeenCalledWith(text);
    expect(add).not.toHaveBeenCalled();
  });

  it('leaves a short single-line paste editable', () => {
    const add = mock();
    render(<PromptInput attachments={attachmentController(add)} onSubmit={mock()} />);

    expect(pasteText(screen.getByRole('textbox'), 'Move budget to the strongest campaign')).toBe(
      true,
    );
    expect(add).not.toHaveBeenCalled();
  });
});

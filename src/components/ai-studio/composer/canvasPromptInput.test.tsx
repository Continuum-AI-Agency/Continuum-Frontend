import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Skill } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromptInput } from '@/components/chat/prompt-input';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import { createCanvasComposerMentionProvider } from './canvasContextProvider';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= TestResizeObserver as unknown as typeof ResizeObserver;

const skill: Skill = {
  id: 'skill-1',
  brandId: 'brand-1',
  isTemplate: false,
  name: 'Bold light',
  slug: 'bold-light',
  description: 'Crisp product light.',
  kind: 'creative_direction',
  surface: 'visual',
  directives: 'Use crisp light.',
  tags: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const media: AgentMentionSuggestion = {
  key: 'media:asset-1',
  label: 'Hero packshot',
  type: 'media_asset',
  source: 'canvas',
  reference: {
    id: 'asset-1',
    type: 'media_asset',
    label: 'Hero packshot',
    source: 'canvas',
    metadata: { kind: 'image' },
  },
};

afterEach(cleanup);

const setEditorText = (editor: HTMLElement, text: string): void => {
  editor.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.input(editor);
  fireEvent.keyUp(editor, { key: text.at(-1) ?? '' });
};

describe('canvas PromptInput context grabber', () => {
  it('turns a picked skill into a canvas reference on submit', async () => {
    const onSubmit = mock();
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [skill],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
    });
    render(
      <PromptInput
        variant="canvas"
        mentionProvider={provider}
        mentionSource="canvas"
        onSubmit={onSubmit}
      />,
    );

    const editor = screen.getByRole('textbox');
    setEditorText(editor, '@');
    fireEvent.click(await screen.findByText('Skills'));
    fireEvent.click(await screen.findByText('Brand skills'));
    fireEvent.click(await screen.findByText('bold-light'));
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ id: 'skill-1', type: 'skill', source: 'canvas' }),
    ]);
  });

  it('turns a searched Library image into a canvas reference on submit', async () => {
    const onSubmit = mock();
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [],
      fetchAssets: async () => [media],
      fetchFolders: async () => [],
    });
    render(
      <PromptInput
        variant="canvas"
        mentionProvider={provider}
        mentionSource="canvas"
        onSubmit={onSubmit}
      />,
    );

    const editor = screen.getByRole('textbox');
    setEditorText(editor, '@Hero');
    fireEvent.click(await screen.findByText('Hero packshot'));
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ id: 'asset-1', type: 'media_asset', source: 'canvas' }),
    ]);
  });
});

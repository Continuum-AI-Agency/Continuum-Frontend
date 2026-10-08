import { afterEach, describe, expect, it } from 'bun:test';
import type { Skill } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SlashMenu, useSlashTextarea } from './slash-menu';

const shortcut = (slug: string, category: string): Skill => ({
  id: `id-${slug}`,
  brandId: null,
  isTemplate: true,
  name: `Name ${slug}`,
  slug,
  description: null,
  kind: 'creative_direction',
  surface: 'visual',
  directives: 'Do it.',
  tags: ['shortcut', `shortcut:${category}`],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const SKILLS = [shortcut('goldenhour', 'light'), shortcut('noir', 'genre')];

function Host({ off = false }: { off?: boolean }) {
  const [value, setValue] = useState('');
  const slash = useSlashTextarea(off ? undefined : SKILLS, setValue);
  return (
    <div className="relative">
      {slash.menuProps ? <SlashMenu {...slash.menuProps} /> : null}
      <textarea
        aria-label="prompt"
        ref={slash.ref}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onSelect={slash.onSelect}
        onKeyDown={slash.onKeyDown}
      />
    </div>
  );
}

const type = (textarea: HTMLTextAreaElement, text: string) => {
  fireEvent.change(textarea, { target: { value: text } });
  textarea.setSelectionRange(text.length, text.length);
  fireEvent.select(textarea);
};

const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

afterEach(cleanup);

describe('useSlashTextarea + SlashMenu', () => {
  it('opens on "/", groups by category, and filters as you type', () => {
    render(<Host />);
    const textarea = screen.getByLabelText('prompt') as HTMLTextAreaElement;

    type(textarea, 'a cat /');
    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('Brand book')).toBeDefined();
    expect(screen.getByText('Light')).toBeDefined();
    expect(screen.getByText('Genre & world')).toBeDefined();

    type(textarea, 'a cat /gold');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '/goldenhourName goldenhour',
    ]);
  });

  it('inserts the picked token on Enter, replacing the fragment', async () => {
    render(<Host />);
    const textarea = screen.getByLabelText('prompt') as HTMLTextAreaElement;

    type(textarea, 'a cat /no');
    // `/nobrand` and `/noir` both match; arrow down to the second.
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await flushFrame();

    expect(textarea.value).toBe('a cat /noir ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and stays closed for that fragment', () => {
    render(<Host />);
    const textarea = screen.getByLabelText('prompt') as HTMLTextAreaElement;

    type(textarea, '/go');
    expect(screen.getByRole('listbox')).toBeDefined();
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();

    type(textarea, '/gol');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stays off when the surface has no skills to offer', () => {
    render(<Host off />);
    type(screen.getByLabelText('prompt') as HTMLTextAreaElement, '/');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

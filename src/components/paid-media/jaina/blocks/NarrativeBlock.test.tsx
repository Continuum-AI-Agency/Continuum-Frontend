import { afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { NarrativeBlockV2 } from '@/lib/jaina/schemas';
import type { AnswerLanguage } from '../answerLanguage';
import { AnswerLanguageProvider } from '../answerLanguageContext';

// The real SafeMarkdown is lazy (next/dynamic + Streamdown); the shape of the block around
// the prose is what is under test, so each run renders as its own text.
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <span className={className} data-testid="md">
      {content}
    </span>
  ),
}));

let NarrativeBlock: typeof import('./NarrativeBlock')['default'];
beforeAll(async () => {
  ({ default: NarrativeBlock } = await import('./NarrativeBlock'));
});

afterEach(cleanup);

const narrative = (overrides: Partial<NarrativeBlockV2>): NarrativeBlockV2 =>
  ({
    block_id: 'reading',
    category: 'narrative',
    scope: 'current_account',
    title: 'Lectura del mes',
    priority: 1,
    provenance: null,
    body: 'SEDE Cañadas trae el 31% de las conversaciones con el 27% del gasto.',
    highlights: [],
    citations: [],
    what: null,
    so_what: null,
    now_what: null,
    ...overrides,
  }) as NarrativeBlockV2;

const THREE = {
  what: 'SEDE Cañadas trae el 31% de las conversaciones con el 27% del gasto; ITESO se lleva el 23% del gasto y aporta el 18%.',
  so_what:
    'El costo promedio está 1.55 MXN arriba del objetivo, y toda la diferencia la explica ITESO (43 MXN por conversación).',
  now_what:
    'Mover 300 MXN al día de ITESO a Cañadas deja el costo del mes en 35.2 MXN, dentro del objetivo.',
};

const renderIn = (language: AnswerLanguage, block: NarrativeBlockV2) =>
  render(
    <AnswerLanguageProvider language={language}>
      <NarrativeBlock block={block} isStreaming={false} />
    </AnswerLanguageProvider>,
  );

const boxesOnScreen = () =>
  Array.from(document.querySelectorAll('[data-narrative-box]')).map((box) => ({
    key: box.getAttribute('data-narrative-box'),
    label: box.querySelector('h5')?.textContent,
    text: box.querySelector('[data-testid="md"]')?.textContent,
  }));

describe('NarrativeBlock — three boxes when the block carries the three fields', () => {
  it('draws Qué pasó · Qué significa · Qué hacer, in that order, for a Spanish answer', () => {
    renderIn('es', narrative(THREE));
    expect(screen.getByTestId('narrative-three')).toBeTruthy();
    expect(boxesOnScreen()).toEqual([
      { key: 'what', label: 'Qué pasó', text: THREE.what },
      { key: 'so_what', label: 'Qué significa', text: THREE.so_what },
      { key: 'now_what', label: 'Qué hacer', text: THREE.now_what },
    ]);
  });

  it('draws What · So what · Now what for an English answer', () => {
    renderIn('en', narrative(THREE));
    expect(boxesOnScreen().map((box) => box.label)).toEqual(['What', 'So what', 'Now what']);
  });

  it('does not print the body beside the boxes — the three fields ARE the reading', () => {
    renderIn('es', narrative(THREE));
    const texts = Array.from(document.querySelectorAll('[data-testid="md"]')).map(
      (node) => node.textContent,
    );
    expect(texts).toEqual([THREE.what, THREE.so_what, THREE.now_what]);
  });

  it('sets each box label at the 12px caps step and each text at body size in the ink colour', () => {
    renderIn('es', narrative(THREE));
    for (const label of document.querySelectorAll('[data-narrative-box] h5')) {
      expect(label.className).toContain('text-xs');
      expect(label.className).toContain('uppercase');
    }
    for (const text of document.querySelectorAll('[data-narrative-box] [data-testid="md"]')) {
      expect(text.className).toContain('text-md');
      expect(text.className).toContain('text-foreground');
    }
  });
});

describe('NarrativeBlock — today’s single body otherwise', () => {
  it('renders the body alone when the block carries none of the three fields', () => {
    renderIn('es', narrative({}));
    expect(screen.queryByTestId('narrative-three')).toBeNull();
    expect(screen.getByTestId('md').textContent).toBe(
      'SEDE Cañadas trae el 31% de las conversaciones con el 27% del gasto.',
    );
  });

  it('renders the body, not two boxes and a hole, when only some of the three arrive', () => {
    renderIn('es', narrative({ what: THREE.what, so_what: THREE.so_what, now_what: '  ' }));
    expect(screen.queryByTestId('narrative-three')).toBeNull();
    expect(screen.getAllByTestId('md')).toHaveLength(1);
  });
});

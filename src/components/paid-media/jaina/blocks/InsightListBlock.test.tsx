import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { InsightListBlockV2 } from '@/lib/jaina/schemas';
import { AnswerLanguageProvider } from '../answerLanguageContext';

let InsightListBlock: typeof import('./InsightListBlock')['default'];

beforeAll(async () => {
  InsightListBlock = (await import('./InsightListBlock')).default;
});

afterEach(cleanup);

type Item = InsightListBlockV2['items'][number];

const item = (overrides: Partial<Item> = {}): Item => ({
  item_type: 'insight',
  title: 'Sub-1.0 account ROAS compresses margins',
  summary: 'Account ROAS on **ITESO** trails break-even at 0.49 on 15,251 MXN of spend.',
  rationale: 'Below the 1.0 line **the brand** set as its floor.',
  impact: 'Every peso on **ITESO** returns less than a peso.',
  severity: 'risk',
  highlight: '0.49',
  priority: 'now',
  cite_ids: [],
  ...overrides,
});

const block = (items: Item[]): InsightListBlockV2 => ({
  block_id: 'b_insights',
  category: 'insight_list',
  scope: 'account',
  title: 'Strategic diagnostics',
  priority: 0,
  provenance: null,
  evidence_refs: [],
  items,
  citations: [],
});

describe('InsightListBlock prose', () => {
  it('sets the judged figure of the summary in the item’s severity tone', () => {
    const { container } = render(<InsightListBlock block={block([item()])} isStreaming={false} />);
    const highlight = container.querySelector('[data-prose-highlight]');
    expect(highlight?.textContent).toBe('0.49');
    expect(highlight?.className).toContain('text-destructive');
  });

  it('sets the entity the model bolded in ink, in the summary, the rationale and the impact', () => {
    const { container } = render(<InsightListBlock block={block([item()])} isStreaming={false} />);
    const bold = Array.from(container.querySelectorAll('strong')).map((el) => el.textContent);
    expect(bold).toEqual(['ITESO', 'the brand', 'ITESO']);
    for (const el of container.querySelectorAll('strong')) {
      expect(el.className).toContain('text-foreground');
    }
    // The asterisks themselves never reach the reader.
    expect(container.textContent).not.toContain('**');
  });

  it('keeps a neutral item’s highlight in plain ink', () => {
    const { container } = render(
      <InsightListBlock
        block={block([item({ severity: 'neutral', highlight: '15,251 MXN' })])}
        isStreaming={false}
      />,
    );
    const highlight = container.querySelector('[data-prose-highlight]');
    expect(highlight?.textContent).toBe('15,251 MXN');
    expect(highlight?.className).toContain('text-foreground');
    expect(highlight?.className).not.toContain('text-destructive');
  });

  it('renders an item with no highlight as plain prose, without inventing one', () => {
    const { container } = render(
      <InsightListBlock block={block([item({ highlight: null })])} isStreaming={false} />,
    );
    expect(container.querySelector('[data-prose-highlight]')).toBeNull();
    expect(container.textContent).toContain('trails break-even at 0.49');
  });
});

// gate-p3 fix 3: a Spanish answer's findings ("Lo que revisé") printed "Impact:" and "NOW" around
// Spanish items on beta — the chrome never asked which language the answer is in.
describe('InsightListBlock chrome follows the answer', () => {
  const renderIn = (language: 'es' | 'en', priority: string) =>
    render(
      <AnswerLanguageProvider language={language}>
        <InsightListBlock block={block([item({ priority })])} isStreaming={false} />
      </AnswerLanguageProvider>,
    );

  it('says impact and priority in Spanish on a Spanish answer', () => {
    const { container } = renderIn('es', 'now');
    expect(container.textContent).toContain('Impacto:');
    expect(container.textContent).toContain('Ahora');
    expect(container.textContent).not.toMatch(/Impact:|\bnow\b/i);
  });

  it('keeps English on an English answer, and a priority it has no word for as written', () => {
    expect(renderIn('en', 'now').container.textContent).toContain('Impact:');
    expect(renderIn('en', 'now').container.textContent).toContain('Now');
    expect(renderIn('es', 'P1').container.textContent).toContain('P1');
  });
});

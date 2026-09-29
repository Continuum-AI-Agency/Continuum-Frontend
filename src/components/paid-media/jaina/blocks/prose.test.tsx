import { afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

// The real SafeMarkdown is lazy (next/dynamic + Streamdown). What is under test here is what
// this module places BETWEEN the markdown runs, so each run renders as its own text node.
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content, className }: { content: string; className?: string }) => (
    <span className={className} data-testid="md">
      {content}
    </span>
  ),
}));

let InlineProse: typeof import('./prose')['InlineProse'];
let JainaProse: typeof import('./prose')['JainaProse'];

beforeAll(async () => {
  ({ InlineProse, JainaProse } = await import('./prose'));
});

afterEach(cleanup);

const citation = { id: 'c1', tool: 'analytics_query', cache_key: 'k', label: 'Spend by day' };

describe('JainaProse', () => {
  it('sets a judged figure in its severity tone, bold and tabular, inside the sentence', () => {
    const { container } = render(
      <JainaProse content="Spend on **ITESO** fell to [risk: 0.49 ROAS] in the [window: last 30 days]." />,
    );
    const risk = container.querySelector('[data-prose-mark="risk"]');
    expect(risk?.textContent).toBe('0.49 ROAS');
    expect(risk?.className).toContain('text-destructive');
    expect(risk?.className).toContain('font-semibold');
    expect(risk?.className).toContain('tabular-nums');
    // The literal markup never reaches the reader.
    expect(container.textContent).not.toContain('[risk:');
    expect(container.textContent).toContain(
      'Spend on **ITESO** fell to 0.49 ROAS in the last 30 days.',
    );
  });

  it('colours by judgement and nothing else: watch is amber, positive is green', () => {
    const { container } = render(
      <JainaProse content="[watch: 1.73% CTR] against [positive: 21.83 MXN per lead]" />,
    );
    expect(container.querySelector('[data-prose-mark="watch"]')?.className).toContain(
      'text-warning',
    );
    expect(container.querySelector('[data-prose-mark="positive"]')?.className).toContain(
      'text-success',
    );
  });

  it('keeps neutral in plain ink — judged, and unremarkable, is never a colour', () => {
    const { container } = render(<JainaProse content="Held at [neutral: 145 purchases]." />);
    const neutral = container.querySelector('[data-prose-mark="neutral"]');
    expect(neutral?.className).toContain('text-foreground');
    expect(neutral?.className).toContain('font-semibold');
    for (const colour of ['text-destructive', 'text-warning', 'text-success']) {
      expect(neutral?.className).not.toContain(colour);
    }
  });

  it('mutes the window and gives it no weight', () => {
    const { container } = render(<JainaProse content="Over the [window: last 7 days]." />);
    const window = container.querySelector('[data-prose-mark="window"]');
    expect(window?.className).toContain('text-muted-foreground');
    expect(window?.className).not.toContain('font-semibold');
  });

  it('is one untouched markdown pass when there is nothing to place in a sentence', () => {
    const { container } = render(
      <JainaProse content={'Plain **prose**.\n\nSecond paragraph.'} className="ink" />,
    );
    const runs = container.querySelectorAll('[data-testid="md"]');
    expect(runs).toHaveLength(1);
    expect(runs[0].textContent).toBe('Plain **prose**.\n\nSecond paragraph.');
    expect(runs[0].className).toContain('ink');
    expect(container.querySelector('[data-prose="marked"]')).toBeNull();
  });

  it('keeps the paragraph break as a structural break when a paragraph carries a mark', () => {
    const { container } = render(
      <JainaProse content={'First [risk: 0.9 ROAS].\n\nSecond paragraph.'} className="ink" />,
    );
    const marked = container.querySelector('[data-prose="marked"]');
    expect(marked?.className).toContain('ink');
    expect(marked?.children).toHaveLength(2);
    // Streamdown's root is a block div: both it and its `p` must flow inline for the mark
    // to sit inside the sentence rather than after it.
    expect(marked?.children[0].className).toContain('[&>div]:inline');
    expect(marked?.children[0].className).toContain('[&_p]:inline');
    expect(marked?.children[1].textContent).toBe('Second paragraph.');
  });

  it('places a citation chip and a mark in the same sentence', () => {
    const { container } = render(
      <JainaProse content="Spend rose [watch: 24%] [cite:c1] this week." citations={[citation]} />,
    );
    expect(container.querySelector('[data-prose-mark="watch"]')?.textContent).toBe('24%');
    expect(container.textContent).toContain('1');
    expect(container.textContent).not.toContain('[cite:');
  });

  it('renders nothing for empty prose', () => {
    const { container } = render(<JainaProse content="   " />);
    expect(container.innerHTML).toBe('');
  });
});

describe('InlineProse', () => {
  it('sets a bold entity in ink and leaves the rest of the run in the surrounding colour', () => {
    const { container } = render(<InlineProse text="Scale **AV CAMACHO Lead Forms** by 20%" />);
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('AV CAMACHO Lead Forms');
    expect(strong?.className).toContain('text-foreground');
    expect(container.textContent).toBe('Scale AV CAMACHO Lead Forms by 20%');
  });

  it("wraps the item's highlight in the item's own severity tone", () => {
    const { container } = render(
      <InlineProse
        text="Account ROAS sits at 0.90 on 80,405 MXN."
        highlight="0.90"
        severity="risk"
      />,
    );
    const highlight = container.querySelector('[data-prose-highlight]');
    expect(highlight?.textContent).toBe('0.90');
    expect(highlight?.className).toContain('text-destructive');
    expect(highlight?.className).toContain('tabular-nums');
    expect(container.textContent).toBe('Account ROAS sits at 0.90 on 80,405 MXN.');
  });

  it('keeps a neutral highlight in plain ink', () => {
    const { container } = render(
      <InlineProse text="Purchases held at 145." highlight="145" severity="neutral" />,
    );
    const highlight = container.querySelector('[data-prose-highlight]');
    expect(highlight?.className).toContain('text-foreground');
    expect(highlight?.className).not.toContain('text-destructive');
  });

  it("forgives the model's casing when matching the highlight, once", () => {
    const { container } = render(
      <InlineProse text="ROAS of 0.9x, then 0.9x again" highlight="0.9X" severity="watch" />,
    );
    const highlights = container.querySelectorAll('[data-prose-highlight]');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].textContent).toBe('0.9x');
  });

  it('places nothing when the highlight is not in the text, rather than inventing a figure', () => {
    const { container } = render(
      <InlineProse text="CTR is drifting." highlight="1.7%" severity="watch" />,
    );
    expect(container.querySelector('[data-prose-highlight]')).toBeNull();
    expect(container.textContent).toBe('CTR is drifting.');
  });

  it('renders a severity mark and a bold run in the same clause', () => {
    const { container } = render(<InlineProse text="Cut **ITESO** at [risk: 0.49 ROAS]" />);
    expect(container.querySelector('strong')?.textContent).toBe('ITESO');
    expect(container.querySelector('[data-prose-mark="risk"]')?.className).toContain(
      'text-destructive',
    );
    expect(container.textContent).toBe('Cut ITESO at 0.49 ROAS');
  });
});

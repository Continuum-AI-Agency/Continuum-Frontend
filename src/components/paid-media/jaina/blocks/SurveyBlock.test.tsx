import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate: _a, transition: _t, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { span: passthrough('span'), div: passthrough('div'), p: passthrough('p') },
    useReducedMotion: () => false,
  };
});

import type { SurveyBlockV2 } from '@/lib/jaina/schemas';
import SurveyBlock from './SurveyBlock';

afterEach(cleanup);

const block = (overrides: Partial<SurveyBlockV2> = {}): SurveyBlockV2 => ({
  block_id: 'b_survey',
  category: 'survey',
  scope: 'account',
  title: 'How “underperforming” was read',
  priority: 2,
  provenance: null,
  evidence_refs: [],
  term: 'underperforming',
  used: 'ROAS below 1.0 over the observation window',
  alternatives: ['cost per messaging conversation above $40', 'CTR below 1.00%'],
  ...overrides,
});

describe('SurveyBlock', () => {
  it('leads with the term, because on this surface the word IS the figure', () => {
    const { container } = render(<SurveyBlock block={block()} isStreaming={false} />);
    const figure = container.querySelector('[data-testid="survey-figure"]');
    expect(figure?.querySelector('span')?.textContent).toBe('“underperforming”');
    expect(figure?.textContent).toContain('was read as');
  });

  it('says the reading the report actually applied, in one sentence', () => {
    const { container } = render(<SurveyBlock block={block()} isStreaming={false} />);
    expect(container.querySelector('[data-testid="survey-sentence"]')?.textContent).toBe(
      'ROAS below 1.0 over the observation window',
    );
  });

  it('reads the alternatives as prose, never as controls', () => {
    const { container } = render(<SurveyBlock block={block()} isStreaming={false} />);
    const alternatives = container.querySelector('[data-testid="survey-alternatives"]');
    expect(alternatives?.textContent).toBe(
      'It could also have meant cost per messaging conversation above $40; CTR below 1.00%.',
    );
    // Choosing another reading is a follow-up message, not a widget state. Anything that
    // looks pressable here is a promise this surface cannot keep.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('carries the contract’s full three alternatives when the model gave three', () => {
    const { container } = render(
      <SurveyBlock block={block({ alternatives: ['a', 'b', 'c'] })} isStreaming={false} />,
    );
    expect(container.querySelector('[data-testid="survey-alternatives"]')?.textContent).toBe(
      'It could also have meant a; b; c.',
    );
  });

  it('breathes on the shared calm rule, silently', () => {
    const { container } = render(<SurveyBlock block={block()} isStreaming={false} />);
    const rule = container.querySelector('[data-testid="survey-calm-rule"]');
    expect(rule).toBeTruthy();
    expect(rule?.textContent).toBe('');
    expect(rule?.getAttribute('aria-hidden')).toBe('true');
  });
});

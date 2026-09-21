import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { CommentTriggerRule } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommentRulesList, ruleState } from './CommentRulesList';

afterEach(cleanup);

const NOW = new Date('2026-09-15T12:00:00.000Z');

let seq = 0;
function rule(overrides: Partial<CommentTriggerRule> = {}): CommentTriggerRule {
  seq += 1;
  return {
    id: `22222222-2222-4222-8222-${String(seq).padStart(12, '0')}`,
    brandId: '11111111-1111-4111-8111-111111111111',
    postScope: 'all_posts',
    platformPostIds: [],
    keywords: ['precio'],
    matchMode: 'contains_word',
    replyMessage: 'Acá tenés la guía',
    publicReplyMessages: [],
    trackedLinkId: null,
    destinationUrl: null,
    linkButtonLabel: null,
    followUpMessage: null,
    followUpDelayMinutes: 0,
    enabled: true,
    priority: 0,
    activeFrom: null,
    activeUntil: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

function renderList(props: Partial<React.ComponentProps<typeof CommentRulesList>> = {}) {
  return render(
    <CommentRulesList
      rules={[]}
      isLoading={false}
      onCreate={noop}
      onEdit={noop}
      onDisableAll={noop}
      isDisablingAll={false}
      now={NOW}
      {...props}
    />,
  );
}

describe('ruleState', () => {
  it('reads off before anything else, so a switched-off rule never looks live', () => {
    const scheduled = rule({ enabled: false, activeFrom: '2026-01-01T00:00:00.000Z' });
    expect(ruleState(scheduled, NOW)).toBe('off');
  });

  it('separates scheduled, live and ended', () => {
    expect(ruleState(rule({ activeFrom: '2026-10-01T00:00:00.000Z' }), NOW)).toBe('scheduled');
    expect(ruleState(rule({ activeUntil: '2026-09-01T00:00:00.000Z' }), NOW)).toBe('expired');
    expect(
      ruleState(
        rule({ activeFrom: '2026-09-01T00:00:00.000Z', activeUntil: '2026-09-30T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe('live');
  });

  it('treats a rule with no dates as live', () => {
    expect(ruleState(rule(), NOW)).toBe('live');
  });
});

describe('CommentRulesList', () => {
  it('explains what a rule is when there are none yet', () => {
    renderList();
    expect(screen.getByText('No rules yet')).toBeDefined();
  });

  it('says how many rules are messaging people unattended', () => {
    renderList({ rules: [rule(), rule(), rule({ enabled: false })] });
    expect(screen.getByText('2 sending automatically')).toBeDefined();
  });

  it('offers the panic button only while something is actually sending', () => {
    renderList({ rules: [rule({ enabled: false })] });
    expect(screen.queryByText('Turn all off')).toBeNull();

    cleanup();
    renderList({ rules: [rule()] });
    expect(screen.getByText('Turn all off')).toBeDefined();
  });

  it('does not count an expired rule as sending', () => {
    // An ended campaign is not a live risk, and counting it would train people
    // to ignore the warning.
    renderList({ rules: [rule({ activeUntil: '2026-09-01T00:00:00.000Z' })] });
    expect(screen.queryByText('Turn all off')).toBeNull();
  });

  it('hands the whole rule back when one is picked', () => {
    const onEdit = mock(() => {});
    const only = rule({ keywords: ['precio', 'info'] });
    renderList({ rules: [only], onEdit });

    fireEvent.click(screen.getByText('precio, info'));
    expect(onEdit).toHaveBeenCalledWith(only);
  });

  it('says how many posts a scoped rule watches', () => {
    renderList({ rules: [rule({ postScope: 'specific_posts', platformPostIds: ['a', 'b'] })] });
    expect(screen.getByText('on 2 posts')).toBeDefined();
  });
});

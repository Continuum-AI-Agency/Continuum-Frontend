import { describe, expect, it } from 'bun:test';
import { buildPlannerDraftDeepLink, presentAgentMessage } from './presentAgentMessage';

const ID = '68fe1000-1111-4111-8111-111111111111';

describe('buildPlannerDraftDeepLink', () => {
  it('builds the canonical planner draft deep link', () => {
    expect(buildPlannerDraftDeepLink(ID)).toBe(`/organic?tab=planner&draftId=${ID}`);
  });

  it('encodes the draft id', () => {
    expect(buildPlannerDraftDeepLink('a/b?c')).toBe('/organic?tab=planner&draftId=a%2Fb%3Fc');
  });
});

describe('presentAgentMessage', () => {
  it('routes the draft linkifier through buildPlannerDraftDeepLink', () => {
    const message = presentAgentMessage(`Draft ID: ${ID}`);
    expect(message).toContain(buildPlannerDraftDeepLink(ID));
  });

  it('turns a raw draft ID into a friendly Planner link', () => {
    const message = presentAgentMessage(`Draft ID: ${ID}`);

    expect(message).toContain('[Open in Planner]');
    expect(message).toContain(`draftId=${ID}`);
    expect(message).not.toContain('Draft ID:');
  });

  it('hides raw job identifiers from retry instructions', () => {
    expect(presentAgentMessage(`Retry job ${ID}`)).toBe('Retry the current generation');
  });
});

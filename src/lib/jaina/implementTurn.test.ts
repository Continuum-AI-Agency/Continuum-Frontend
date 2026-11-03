import { describe, expect, it } from 'bun:test';
import { buildImplementProposalTurn } from '@continuum/contracts';
import { implementablePreview } from './implementProposal.fixture';
import { answersImplementTurn } from './implementTurn';

const turn = buildImplementProposalTurn(implementablePreview()) ?? '';
const user = (content: string) => ({ role: 'user' as const, content });
const assistant = { role: 'assistant' as const, content: 'Done.' };

describe('answersImplementTurn', () => {
  it('is true for the answer to the canvas implement turn', () => {
    expect(answersImplementTurn([user('Propose a change'), assistant, user(turn), assistant])).toBe(
      true,
    );
  });

  it('is false for the answer to the proposal and to any ordinary question', () => {
    expect(answersImplementTurn([user('Propose a change'), assistant])).toBe(false);
    expect(answersImplementTurn([user('Propose a change'), assistant, user(turn)])).toBe(false);
    expect(answersImplementTurn([])).toBe(false);
  });
});

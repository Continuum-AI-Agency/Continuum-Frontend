import { isImplementProposalTurn } from '@continuum/contracts';

type TurnMessage = { role: string; content: string };

/**
 * Whether the last message is Jaina's answer to the canvas's "Implement these changes" turn.
 * That turn is machine-written, so what the planner names it ("Implement this proposal now")
 * must not rename the conversation the proposal was made in.
 */
export const answersImplementTurn = (messages: readonly TurnMessage[]): boolean => {
  const answer = messages.at(-1);
  const asked = messages.at(-2);
  return (
    answer?.role === 'assistant' && asked?.role === 'user' && isImplementProposalTurn(asked.content)
  );
};

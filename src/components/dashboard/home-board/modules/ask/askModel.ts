// Ask Home (H14): three or four questions worth asking Jaina about this brand right now, read
// from the Home's reading and board — the mode first (what Continuum is doing for the brand),
// then the goal, then what the board shows. A question names only what the reading already
// holds (an issue's title, a waiting opportunity's title, the goal's label); it never carries a
// figure the reading does not.
//
// Pure. The bar opens Jaina with the chosen question written in; nothing is asked from the Home.

import type { HomeBoard, HomeBrandReading } from '@continuum/contracts';

export type AskSuggestion = { key: string; question: string };

const MAX_SUGGESTIONS = 4;

function modeQuestions(reading: HomeBrandReading): AskSuggestion[] {
  const waiting = reading.opportunities.filter((opportunity) => opportunity.count > 0);
  switch (reading.mode) {
    case 'setup': {
      const [first] = reading.goal.suggested;
      return [
        { key: 'setup-start', question: 'What should I connect first to get this brand started?' },
        ...(first
          ? [
              {
                key: 'setup-goal',
                question: `Is ${first.label.toLowerCase()} the right goal for this business?`,
              },
            ]
          : []),
        {
          key: 'setup-plan',
          question: 'What will Continuum do for this brand once an account is connected?',
        },
      ];
    }
    case 'fix':
      return [
        ...reading.issues.slice(0, 2).map((issue, index) => ({
          key: `fix-issue-${index}`,
          question: `How do I fix this: ${issue.title}?`,
        })),
        { key: 'fix-blocking', question: 'What else is holding results back this week?' },
      ];
    case 'operate':
      return [
        { key: 'operate-overnight', question: 'What did Autopilot change overnight, and why?' },
        ...waiting.slice(0, 1).map((opportunity) => ({
          key: 'operate-waiting',
          question: `What is behind this: ${opportunity.title}?`,
        })),
      ];
    case 'approve':
      return waiting.length > 0
        ? waiting.slice(0, 2).map((opportunity, index) => ({
            key: `approve-waiting-${index}`,
            question: `What should I approve first: ${opportunity.title}?`,
          }))
        : [{ key: 'approve-none', question: 'Is there anything worth approving this week?' }];
    case 'recommend':
      return [
        {
          key: 'recommend-first',
          question: 'What should we recommend the client change first this week?',
        },
        ...waiting.slice(0, 1).map((opportunity) => ({
          key: 'recommend-waiting',
          question: `Explain this for the client: ${opportunity.title}`,
        })),
      ];
  }
}

function goalQuestion(reading: HomeBrandReading): AskSuggestion | null {
  if (reading.mode === 'setup') return null;
  const { goal } = reading;
  if (goal.source === 'team' || goal.source === 'business') {
    return {
      key: 'goal-pace',
      question: `Are we on pace for ${goal.label.toLowerCase()} this month?`,
    };
  }
  if (goal.source === 'results') {
    return { key: 'goal-results', question: 'Which result are my ads bringing most this month?' };
  }
  return null;
}

function boardQuestions(reading: HomeBrandReading, board: HomeBoard): AskSuggestion[] {
  const out: AskSuggestion[] = [];
  if (reading.opportunities.some((opportunity) => opportunity.portfolioId === null)) {
    out.push({
      key: 'board-portfolios',
      question: 'How should I group my campaigns into portfolios?',
    });
  }
  const tiles = new Set(board.tiles.map((tile) => tile.id));
  if (tiles.has('creative')) {
    out.push({ key: 'board-creative', question: 'Which ad should I refresh first, and why?' });
  }
  if (tiles.has('organic')) {
    out.push({ key: 'board-organic', question: 'What should I post this week?' });
  }
  return out;
}

const FALLBACK: AskSuggestion[] = [
  { key: 'fallback-week', question: 'What changed in my accounts this week?' },
];

export function askSuggestions(reading: HomeBrandReading, board: HomeBoard): AskSuggestion[] {
  const goal = goalQuestion(reading);
  const candidates = [
    ...modeQuestions(reading),
    ...(goal ? [goal] : []),
    ...boardQuestions(reading, board),
    // A brand with no account has no week to ask about.
    ...(reading.mode === 'setup' ? [] : FALLBACK),
  ];
  const seen = new Set<string>();
  const unique = candidates.filter((candidate) => {
    if (seen.has(candidate.question)) return false;
    seen.add(candidate.question);
    return true;
  });
  return unique.slice(0, MAX_SUGGESTIONS);
}

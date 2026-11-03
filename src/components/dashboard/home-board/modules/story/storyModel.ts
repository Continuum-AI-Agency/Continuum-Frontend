// The weekly story (H15): the brand's week told in a few slides, composed only from what the Home
// already read — how Continuum works the brand, the goal, what blocks results, what waits for a
// decision, and Jaina's latest stored read. A part with nothing behind it is left out; no slide
// is ever filled with a figure the inputs do not hold.
//
// Pure, so every sentence on a slide can be checked against its inputs.

import type { HomeBrandReading } from '@continuum/contracts';
import { type BriefEntry, readOnLabel, staleLabel } from '../brief/briefModel';

export type StorySlide = {
  key: 'mode' | 'issues' | 'goal' | 'opportunity' | 'waiting' | 'brief';
  /** Product chrome: what the slide is about. */
  kicker: string;
  title?: string;
  body?: string;
  list?: string[];
};

const MAX_LIST = 3;

export function weeklyStory(input: {
  reading: HomeBrandReading;
  brief: BriefEntry | null;
  today: Date;
}): StorySlide[] {
  const { reading, brief, today } = input;
  const slides: StorySlide[] = [
    {
      key: 'mode',
      kicker: 'How Continuum works the brand',
      title: reading.modeLabel,
      body: reading.modeReason,
    },
  ];

  const issues = reading.issues.slice(0, MAX_LIST).map((issue) => issue.title);
  if (issues.length > 0) slides.push({ key: 'issues', kicker: 'Fix first', list: issues });

  if (reading.goal.source !== 'none') {
    slides.push({
      key: 'goal',
      kicker: 'Goal',
      title: reading.goal.label,
      body: reading.goal.detail,
    });
  }

  const waiting = reading.opportunities.filter((opportunity) => opportunity.count > 0);
  const [biggest, ...rest] = waiting;
  const nextStep = reading.opportunities.find((opportunity) => opportunity.portfolioId === null);
  if (biggest) {
    slides.push({ key: 'opportunity', kicker: 'Biggest opportunity', title: biggest.title });
  } else if (nextStep) {
    slides.push({ key: 'opportunity', kicker: 'Next step', title: nextStep.title });
  }
  if (rest.length > 0) {
    slides.push({
      key: 'waiting',
      kicker: 'Also waiting',
      list: rest.slice(0, MAX_LIST).map((opportunity) => opportunity.title),
    });
  }

  if (brief) {
    const age = staleLabel(brief);
    slides.push({
      key: 'brief',
      kicker: "Jaina's latest read",
      title: age ? `${readOnLabel(brief, today)} · ${age}` : readOnLabel(brief, today),
      body: brief.narrative,
    });
  }

  return slides;
}

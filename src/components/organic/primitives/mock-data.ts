import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicTrendType,
} from './types';

export const organicCalendarDays: OrganicCalendarDay[] = [
  {
    id: '2026-01-26',
    label: 'Monday',
    dateLabel: 'Jan 26',
    suggestedTimes: ['09:00', '17:00'],
    slots: [
      {
        id: 'draft-1',
        title: 'Product Launch Teaser',
        summary: 'Tease the new feature with a short video.',
        timeLabel: '09:00',
        dateLabel: 'Jan 26',
        status: 'draft',
        platforms: ['instagram', 'linkedin'],
        format: 'Reel',
        objective: 'Awareness',
        captionPreview: 'Something big is coming... #newfeature',
        tags: ['product', 'launch'],
        mediaCount: 1,
      } as OrganicCalendarDraft,
    ],
  },
  {
    id: '2026-01-27',
    label: 'Tuesday',
    dateLabel: 'Jan 27',
    suggestedTimes: ['10:00'],
    slots: [],
  },
  {
    id: '2026-01-28',
    label: 'Wednesday',
    dateLabel: 'Jan 28',
    suggestedTimes: ['12:00'],
    slots: [],
  },
  {
    id: '2026-01-29',
    label: 'Thursday',
    dateLabel: 'Jan 29',
    suggestedTimes: ['15:00'],
    slots: [],
  },
  {
    id: '2026-01-30',
    label: 'Friday',
    dateLabel: 'Jan 30',
    suggestedTimes: ['09:00'],
    slots: [],
  },
  {
    id: '2026-01-31',
    label: 'Saturday',
    dateLabel: 'Jan 31',
    suggestedTimes: [],
    slots: [],
  },
  {
    id: '2026-02-01',
    label: 'Sunday',
    dateLabel: 'Feb 01',
    suggestedTimes: [],
    slots: [],
  },
];

export const organicCreationSteps: OrganicCreationStep[] = [
  {
    id: 'step-1',
    title: 'Select Trends',
    detail: 'Choose relevant trends',
    status: 'active',
  },
  {
    id: 'step-2',
    title: 'Review Plan',
    detail: 'Check the weekly grid',
    status: 'upcoming',
  },
];

export const organicEditorSlides: OrganicEditorSlide[] = [
  {
    id: 'slide-1',
    label: 'Intro',
    gradient: 'from-blue-500 to-cyan-500',
  },
];

export const organicTrendTypes: OrganicTrendType[] = [
  {
    id: 'trends',
    label: 'Trends',
    groups: [
      {
        id: 'general',
        title: 'General Trends',
        trends: [
          {
            id: 'trend-1',
            title: 'AI Revolution',
            summary: 'AI is changing everything.',
            momentum: 'rising',
            tags: ['tech', 'ai'],
            platforms: ['linkedin', 'instagram'],
          },
        ],
      },
    ],
  },
];

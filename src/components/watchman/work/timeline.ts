// Adapted from Brigade packages/contracts/src/thread-history.ts at c5100df20b3a7ef335dac03ccc6745e5caba4274.
// Copyright (c) 2026 Georges Petrov. MIT; see THIRD_PARTY_NOTICES.md.
export type TimelineMessage = {
  seq: number;
  at: string;
  text: string;
  count: number;
  last: number;
};
const TIMELINE_MARKS = 50;
const markOf = (index: number, count: number) =>
  Math.floor((index * Math.min(count, TIMELINE_MARKS)) / count);

export function groupMarks(messages: Omit<TimelineMessage, 'count' | 'last'>[]): TimelineMessage[] {
  const marks: TimelineMessage[] = [];
  messages.forEach((message, index) => {
    const mark = markOf(index, messages.length);
    const open = marks[mark];
    if (open) {
      open.count++;
      open.last = message.seq;
    } else marks[mark] = { ...message, count: 1, last: message.seq };
  });
  return marks;
}

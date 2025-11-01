export type PostingState = Record<
  string,
  {
    ready: boolean;
    scheduledAt: string;
  }
>;

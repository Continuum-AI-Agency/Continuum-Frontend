'use client';

import { Pill } from '@/components/kibo-ui/pill';

type ClarificationBannerProps = {
  question: string;
  onFocusInput?: () => void;
};

export function ClarificationBanner({ question, onFocusInput }: ClarificationBannerProps) {
  return (
    <div className="rounded-xl border-l-2 border-amber-400/60 border border-amber-300/30 bg-amber-50/8 px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Pill variant="warning" className="uppercase text-2xs tracking-wide shrink-0">
          Clarification needed
        </Pill>
      </div>
      {question ? (
        <span className="block text-sm text-foreground/90 leading-relaxed">{question}</span>
      ) : null}
      <button
        type="button"
        onClick={onFocusInput}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-400/20 cursor-pointer"
      >
        Reply to this
      </button>
    </div>
  );
}

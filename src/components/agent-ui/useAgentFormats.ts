'use client';
import { useLocale } from 'next-intl';
import { formatAway, formatClock, formatTokens, formatUsd } from './model';
export function useAgentFormats() {
  const locale = useLocale();
  return {
    formatClock: (ms: number) => formatClock(ms, locale),
    formatTokens: (value: number) => formatTokens(value, locale),
    formatUsd: (value: number) => formatUsd(value, locale),
    formatAway,
  };
}

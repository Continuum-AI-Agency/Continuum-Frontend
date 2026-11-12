'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FrontendCheckpointReport } from '@/lib/jaina/schemas';

type JainaReportNavProps = {
  idPrefix?: string;
  report: FrontendCheckpointReport | null;
};

export function JainaReportNav({ idPrefix = 'jaina-report', report }: JainaReportNavProps) {
  const uiText = useTranslations('scale');
  const NAV_ITEMS = useMemo(
    () => [
      { key: 'executive-summary', label: uiText('executive_summary_53d548a') },
      {
        key: 'performance-snapshot',
        label: uiText('performance_snapshot_e467de5'),
      },
      {
        key: 'strategic-insights',
        label: uiText('strategic_insights_b5fe78d'),
      },
      { key: 'recommendations', label: uiText('recommendations_0738ee0') },
      { key: 'key-trends', label: uiText('key_trends_fe524ca') },
      { key: 'data-tables', label: uiText('data_tables_33c1948') },
    ],
    [uiText],
  );

  const getSectionId = useCallback((key: string) => `${idPrefix}-${key}`, [idPrefix]);
  const [activeId, setActiveId] = useState<string>(() => getSectionId('executive-summary'));

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        root: null,
        rootMargin: '-20% 0px -60% 0px', // Trigger when element is near top
        threshold: 0,
      },
    );

    const elements = NAV_ITEMS.map(({ key }) => document.getElementById(getSectionId(key))).filter(
      Boolean,
    );
    elements.forEach((el) => el && observer.observe(el));

    return () => observer.disconnect();
  }, [getSectionId]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  return (
    <div className="sticky top-0 w-full">
      <div className="flex flex-col gap-1">
        <span className="mb-3 uppercase tracking-widest text-xs font-semibold text-muted-foreground">
          {uiText('table_of_contents_a9360e0')}
        </span>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.filter((item) => {
            if (item.key === 'executive-summary') return true;
            if (item.key === 'performance-snapshot')
              return (report?.performance_snapshot.length ?? 0) > 0;
            if (item.key === 'strategic-insights') return (report?.sections.length ?? 0) > 0;
            if (item.key === 'recommendations')
              return (report?.strategic_recommendations.length ?? 0) > 0;
            if (item.key === 'key-trends') return (report?.graphs.length ?? 0) > 0;
            if (item.key === 'data-tables') return true; // Fallback tables might exist
            return true;
          }).map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => scrollToSection(getSectionId(item.key))}
              className={`text-left text-sm py-1.5 px-3 rounded-md transition-all duration-200 cursor-pointer border-l-2 ${
                activeId === getSectionId(item.key)
                  ? 'bg-white/5 text-primary-ink border-primary font-medium'
                  : 'text-muted-foreground hover:text-white hover:bg-white/5 border-transparent hover:border-white/20'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

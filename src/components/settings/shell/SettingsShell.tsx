'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { Menu } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsNav } from './SettingsNav';
import { SwitchingIndicator } from './SwitchingIndicator';
import { resolveSection, type SectionKey } from './sections';

type SettingsShellProps = {
  activeSection: SectionKey;
  brandPill: ReactNode;
  accountPill: ReactNode;
  activeSectionSlot: ReactNode;
};

export function SettingsShell({
  activeSection,
  brandPill,
  accountPill,
  activeSectionSlot,
}: SettingsShellProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [section, setSection] = useState<SectionKey>(activeSection);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setSection(activeSection);
  }, [activeSection]);

  const handleChange = useCallback(
    (value: string) => {
      const next = resolveSection(value);
      if (next === section) return;
      setSection(next);
      setMobileOpen(false);
      const search = new URLSearchParams(params?.toString() ?? '');
      if (next === 'general') {
        search.delete('section');
      } else {
        search.set('section', next);
      }
      const qs = search.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [params, router, section],
  );

  return (
    <div className="@container/settings">
      <Tabs.Root
        orientation="vertical"
        value={section}
        onValueChange={handleChange}
        className="grid grid-cols-1 gap-[var(--shell-stack-gap)] @[56rem]/settings:grid-cols-[minmax(var(--shell-secondary-w-min),18%)_minmax(0,1fr)] @[56rem]/settings:gap-[var(--page-section-gap)]"
      >
        <SwitchingIndicator />
        <div className="flex items-center justify-between @[56rem]/settings:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="gap-2">
                  <Menu className="h-4 w-4" />
                  Sections
                </Button>
              }
            />
            <SheetContent
              side="left"
              className="w-[min(var(--shell-secondary-w),calc(100vw-1rem))] px-3 py-6"
            >
              <SheetTitle className="sr-only">Settings sections</SheetTitle>
              <SettingsNav brandPill={brandPill} accountPill={accountPill} />
            </SheetContent>
          </Sheet>
        </div>

        <aside className="hidden @[56rem]/settings:block">
          <div className="sticky top-4">
            <SettingsNav brandPill={brandPill} accountPill={accountPill} />
          </div>
        </aside>

        <div className="min-w-0 max-w-[var(--shell-content-max)]">
          <Tabs.Content
            key={activeSection}
            value={section}
            className="space-y-[var(--page-section-gap)] outline-none data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:duration-200"
          >
            {section === activeSection ? activeSectionSlot : <SettingsSectionSkeleton />}
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

function SettingsSectionSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-[var(--card-pad)]">
      <div className="mb-3 space-y-2">
        <Skeleton className="h-5 w-48 bg-muted/70" />
        <Skeleton className="h-4 w-72 bg-muted/70" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full bg-muted/70" />
        <Skeleton className="h-16 w-full bg-muted/70" />
        <Skeleton className="h-16 w-4/5 bg-muted/70" />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveSection, type SectionKey } from "./sections";
import { SettingsNav } from "./SettingsNav";
import { SwitchingIndicator } from "./SwitchingIndicator";

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
      const search = new URLSearchParams(params?.toString() ?? "");
      if (next === "general") {
        search.delete("section");
      } else {
        search.set("section", next);
      }
      const qs = search.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [params, router, section]
  );

  return (
    <Tabs.Root
      orientation="vertical"
      value={section}
      onValueChange={handleChange}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10"
    >
      <SwitchingIndicator />
      <div className="flex items-center justify-between lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="h-4 w-4" />
              Sections
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 px-3 py-6">
            <SheetTitle className="sr-only">Settings sections</SheetTitle>
            <SettingsNav brandPill={brandPill} accountPill={accountPill} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <SettingsNav brandPill={brandPill} accountPill={accountPill} />
        </div>
      </aside>

      <div className="min-w-0 max-w-4xl">
        <Tabs.Content
          key={activeSection}
          value={section}
          className="space-y-6 outline-none data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:duration-200"
        >
          {section === activeSection ? activeSectionSlot : <SettingsSectionSkeleton />}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

function SettingsSectionSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-6">
      <div className="mb-5 space-y-2">
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

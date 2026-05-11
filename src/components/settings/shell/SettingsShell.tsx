"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { resolveSection, type SectionKey } from "./sections";
import { SettingsNav } from "./SettingsNav";
import { SwitchingIndicator } from "./SwitchingIndicator";

type SettingsShellProps = {
  initialSection: SectionKey;
  brandPill: ReactNode;
  accountPill: ReactNode;
  sections: Record<SectionKey, ReactNode>;
};

export function SettingsShell({
  initialSection,
  brandPill,
  accountPill,
  sections,
}: SettingsShellProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [section, setSection] = useState<SectionKey>(initialSection);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleChange = useCallback(
    (value: string) => {
      const next = resolveSection(value);
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
    [params, router]
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
        {(Object.entries(sections) as Array<[SectionKey, ReactNode]>).map(
          ([key, node]) => (
            <Tabs.Content
              key={key}
              value={key}
              className="space-y-6 outline-none data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:duration-200"
            >
              {node}
            </Tabs.Content>
          )
        )}
      </div>
    </Tabs.Root>
  );
}

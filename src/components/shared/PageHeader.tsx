import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

// The canonical workspace/page title block: a modest sentence-case title with an
// optional one-line description and a right-aligned action. The calm-dense house
// style — replaces the ad-hoc text-2xl/text-xl page headers across the app. Page
// titles use this (text-base); sub-panels use SectionHeader (text-xs uppercase).
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <header className={cn("flex shrink-0 items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

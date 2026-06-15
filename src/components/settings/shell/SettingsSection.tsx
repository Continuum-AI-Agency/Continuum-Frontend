import type { ReactNode } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";

type SettingsSectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function SettingsSection({
  title,
  description,
  action,
  className,
  children,
}: SettingsSectionProps) {
  return (
    <GlassPanel className={cn("@container/settings-section p-[var(--card-pad)]", className)}>
      <header className="mb-3 flex flex-col items-stretch justify-between gap-3 @[32rem]/settings-section:flex-row @[32rem]/settings-section:items-start">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 @[32rem]/settings-section:text-right">{action}</div> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </GlassPanel>
  );
}

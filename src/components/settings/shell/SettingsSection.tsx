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
    <GlassPanel className={cn("p-6 md:p-7", className)}>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </GlassPanel>
  );
}

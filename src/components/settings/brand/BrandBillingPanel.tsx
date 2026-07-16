import type { BillingSummary } from '@continuum/contracts';
import { Bot, BrainCircuit, Database, Sparkles, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

type BrandBillingPanelProps = {
  summary: BillingSummary | null;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 GB';
  const gb = bytes / 1024 ** 3;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
};

const accessItems = [
  { key: 'organicAgent', label: 'Organic Agent', icon: Bot },
  { key: 'jaina', label: 'Jaina', icon: BrainCircuit },
  { key: 'trends', label: 'Trends', icon: TrendingUp },
  { key: 'canvas', label: 'Organic Canvas', icon: Sparkles },
] as const;

export function BrandBillingPanel({ summary }: BrandBillingPanelProps) {
  if (!summary) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/30 p-5">
        <p className="text-sm font-medium text-foreground">Usage is temporarily unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your access remains unchanged. Refresh to retry the usage service.
        </p>
      </div>
    );
  }

  const { entitlements, storage, canvasUsage } = summary;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {accessItems.map(({ key, label, icon: Icon }) => {
          const enabled = entitlements.access[key];
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 p-4"
            >
              <div className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
              <Badge variant={enabled ? 'secondary' : 'outline'}>
                {enabled ? 'Available' : 'Not enabled'}
              </Badge>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-card/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Generation credits</p>
            </div>
            <Badge variant="outline">{canvasUsage.health.replaceAll('_', ' ')}</Badge>
          </div>
          <p className="font-mono text-2xl font-semibold text-foreground">
            {entitlements.canvasCredits.available}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">credits available</p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/50 pt-3 text-xs">
            <div>
              <p className="text-muted-foreground">Used this week</p>
              <p className="mt-1 font-mono text-foreground">{canvasUsage.creditsSpent7Days}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Used this month</p>
              <p className="mt-1 font-mono text-foreground">{canvasUsage.creditsSpent30Days}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Library storage</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {formatBytes(storage.usedBytes)} / {formatBytes(storage.capacityBytes)}
            </span>
          </div>
          <Progress value={Math.min(100, storage.utilizationPercent)} aria-label="Storage used" />
          <p className="mt-3 text-xs text-muted-foreground">
            {formatBytes(storage.availableBytes)} available. Upload reservations prevent concurrent
            files from exceeding capacity.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Intelligence providers: {entitlements.intelligenceProviders.length > 0
            ? entitlements.intelligenceProviders
                .map((provider) => provider.replace('provider_', ''))
                .join(', ')
            : 'baseline Trends intelligence'}
        </p>
      </div>
    </div>
  );
}

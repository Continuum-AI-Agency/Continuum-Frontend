import { CreditCard, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BrandBillingPanelProps = {
  tier: number;
};

export function BrandBillingPanel({ tier }: BrandBillingPanelProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-card/30 px-4 py-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Current plan
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              Tier {tier}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Plan tiers are mapped to AI Studio capabilities.
            </span>
          </div>
        </div>
        <Button disabled size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Upgrade plan
        </Button>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">AI Studio credits</p>
          <span className="font-mono text-xs text-muted-foreground">— / — credits</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary/40"
            style={{ width: "0%" }}
            aria-hidden
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Credit metering ships with the next billing release.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-8 text-center">
        <CreditCard className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">Invoices coming soon</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Receipts, usage, and payment history will appear here once billing is live.
        </p>
      </div>
    </div>
  );
}

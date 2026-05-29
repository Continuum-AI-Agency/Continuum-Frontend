import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WarningCircle, CircleNotch, Sparkle } from "@phosphor-icons/react";

type UrlScreenProps = {
  defaultUrl?: string | null;
  onSubmit: (url: string) => void;
  error?: string | null;
  retrying?: boolean;
  onRetry?: () => void;
};

export function UrlScreen({ defaultUrl, onSubmit, error, retrying, onRetry }: UrlScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_22%,transparent)] bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_8%,transparent)] px-3 py-1 text-[11px] font-semibold text-[var(--cs-violet,#5a39ff)]">
            <Sparkle className="h-3 w-3" />
            Step 1 of 5
          </div>
          <h1 className="text-balance text-[28px] font-bold leading-tight tracking-tight text-foreground md:text-[40px]">
            Your website
          </h1>
        </div>
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const value = String(data.get("url") ?? "").trim();
                if (value) onSubmit(value);
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="onboarding-url" className="text-[12px] font-medium text-muted-foreground">
                  Website URL
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                    https://
                  </span>
                  <Input
                    id="onboarding-url"
                    name="url"
                    autoFocus
                    defaultValue={defaultUrl ?? ""}
                    placeholder="yourdomain.com"
                    className="h-12 rounded-lg border-input bg-background pl-[68px] text-[14px] text-foreground focus-visible:border-primary focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5"
                >
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-destructive">Couldn&apos;t scan that URL</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-destructive/80">{error}</p>
                    {onRetry ? (
                      <button
                        type="button"
                        onClick={onRetry}
                        disabled={retrying}
                        className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
                      >
                        {retrying ? <CircleNotch className="h-3 w-3 animate-spin" /> : null}
                        {retrying ? "Retrying…" : "Try again"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <Button type="submit" variant="default" size="lg" className="w-full" disabled={retrying}>
                {retrying ? "Analyzing…" : "Analyze my brand"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NorthStarCtaProps = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone?: "primary" | "neutral";
};

// A single North Star action: a navigation card routing the user to their next
// move (create, launch, plan). Rendered as a Link for full-card click + prefetch.
export function NorthStarCta({ title, description, href, icon: Icon, tone = "neutral" }: NorthStarCtaProps) {
  const isPrimary = tone === "primary";

  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "group/cta flex items-center gap-3 rounded-lg border p-3 transition-colors active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        isPrimary
          ? "border-[color-mix(in_srgb,var(--primary)_38%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]"
          : "border-border/70 bg-card hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          isPrimary
            ? "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-[var(--primary)]"
            : "bg-muted/60 text-muted-foreground",
        )}
      >
        <Icon className="size-4 stroke-[1.8]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/cta:translate-x-0.5" />
    </Link>
  );
}

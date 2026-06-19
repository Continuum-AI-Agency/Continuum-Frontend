import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// Shared "open the full Brand Spy workspace" affordance for the dashboard
// competitor panels. The dashboard tables are a teaser; the workspace is the
// full surface.
export function CompetitorSpyLink() {
  return (
    <Link
      href="/competitor-spy"
      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      Brand Spy
      <ArrowUpRight className="size-3" />
    </Link>
  );
}

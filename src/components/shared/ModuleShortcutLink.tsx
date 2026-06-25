import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// The "go to the full workspace" affordance used across every module/panel: a
// quiet inline link with a trailing up-right arrow. A panel is a teaser; this
// jumps to the surface where the user can act on it.
export function ModuleShortcutLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <ArrowUpRight className="size-3" />
    </Link>
  );
}

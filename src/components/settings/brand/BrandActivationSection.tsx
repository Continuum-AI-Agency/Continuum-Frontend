import Link from "next/link"
import {
  ArrowUpRight,
  BookOpen,
  Library,
  Link2,
  Plug,
  Target,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { GlossaryTooltip } from "@/components/shared/glossary"

// Activation launcher (IMP-017). Pulls the setup actions that are otherwise
// scattered across dense settings tabs — Brand Book, Knowledge, Integrations,
// Connections, competitors — into one "start here" surface. Each card links to
// the existing section; nothing here duplicates those surfaces or their data.

type ActivationTarget = {
  icon: LucideIcon
  title: string
  description: ReactNode
  href: string
  cta: string
}

const ACTIVATION_TARGETS: readonly ActivationTarget[] = [
  {
    icon: Library,
    title: "Brand Book",
    description: "Teach Continuum your identity, voice, and guidelines so every output sounds like you.",
    href: "/settings?section=brand-book",
    cta: "Open Brand Book",
  },
  {
    icon: BookOpen,
    title: "Knowledge",
    description: "Upload the documents Jaina reads for app-wide brand intelligence.",
    href: "/settings?section=knowledge",
    cta: "Add knowledge",
  },
  {
    icon: Plug,
    title: "Integrations",
    description: "Assign the ad, social, and analytics accounts this brand runs on.",
    href: "/settings?section=integrations",
    cta: "Assign accounts",
  },
  {
    icon: Target,
    title: "Competitors",
    description: "Track competitor posts and ads in Brand Spy to benchmark and find white space.",
    href: "/competitor-spy?tab=competitors",
    cta: "Track competitors",
  },
]

function ConnectionsCard() {
  return (
    <ActivationCard
      icon={Link2}
      title="Connections"
      description={
        <>
          Link your own OAuth providers and the{" "}
          <GlossaryTooltip termKey="mcp">MCP</GlossaryTooltip> connectors (like Claude)
          you authorize with your login.
        </>
      }
      href="/settings?section=connections"
      cta="Manage connections"
    />
  )
}

function ActivationCard({ icon: Icon, title, description, href, cta }: ActivationTarget) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card/20 p-4 transition-colors hover:border-foreground/30 hover:bg-card/40"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <span className="mt-auto inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {cta}
        <ArrowUpRight className="size-3" aria-hidden />
      </span>
    </Link>
  )
}

export function BrandActivationSection() {
  return (
    <div className="grid grid-cols-1 gap-3 @[32rem]/settings-section:grid-cols-2">
      {ACTIVATION_TARGETS.map((target) => (
        <ActivationCard key={target.href} {...target} />
      ))}
      <ConnectionsCard />
    </div>
  )
}

'use client';

import type { ProductGroupView, SellableModuleView } from '@continuum/billing-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ProductModulesGridProps = {
  groups: ProductGroupView[];
  busy?: boolean;
  onSubscribe: (codes: string[]) => void;
};

export function ProductModulesGrid({ groups, busy, onSubscribe }: ProductModulesGridProps) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`billing-group-${group.id}`} className="space-y-3">
          <div className="space-y-1">
            <h3 id={`billing-group-${group.id}`} className="text-base font-semibold tracking-tight">
              {group.title}
            </h3>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {group.modules.map((mod) => (
              <li key={mod.code}>
                <ModuleCard module={mod} busy={busy} onSubscribe={onSubscribe} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ModuleCard({
  module: mod,
  busy,
  onSubscribe,
}: {
  module: SellableModuleView;
  busy?: boolean;
  onSubscribe: (codes: string[]) => void;
}) {
  const canCheckout =
    mod.commerceKind === 'stripe' &&
    mod.stripeSellable &&
    !mod.entitled &&
    mod.requiresMet &&
    mod.checkoutCodes.length > 0;

  return (
    <Card className="h-full border-border/80 shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{mod.name}</CardTitle>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {mod.badge}
              </Badge>
            </div>
            <CardDescription>{mod.description}</CardDescription>
          </div>
          <Badge variant={mod.entitled ? 'default' : 'secondary'} className="shrink-0">
            {mod.entitled ? 'Active' : mod.commerceKind === 'contact_us' ? 'Enterprise' : 'Off'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {mod.features.map((feature) => (
            <li key={feature} className="flex gap-2 text-xs text-muted-foreground">
              <span
                className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-600/80 dark:bg-emerald-500/80"
                aria-hidden
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="justify-between gap-3 border-t border-border/60">
        <span className="font-mono text-sm tabular-nums">{mod.priceLabel}</span>
        {canCheckout ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onSubscribe(mod.checkoutCodes)}
          >
            {mod.code === 'trends_plus' ? 'Add providers' : 'Subscribe'}
          </Button>
        ) : null}
        {mod.commerceKind === 'stripe' && mod.stripeSellable && mod.entitled ? (
          <span className="text-xs text-muted-foreground">Manage in portal</span>
        ) : null}
        {mod.commerceKind === 'stripe' &&
        mod.stripeSellable &&
        !mod.entitled &&
        !mod.requiresMet ? (
          <span className="text-xs text-muted-foreground">Requires Trends Core</span>
        ) : null}
        {mod.commerceKind === 'included' ? (
          <span className="text-xs text-muted-foreground">Included with credits</span>
        ) : null}
        {mod.commerceKind === 'contact_us' && mod.contactHref ? (
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={mod.contactHref}>Contact us</a>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

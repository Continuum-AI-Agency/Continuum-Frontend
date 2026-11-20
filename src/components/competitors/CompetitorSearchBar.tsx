'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { cn } from '@/lib/utils';

export function CompetitorSearchBar({
  value = '',
  onChange,
  onSubmit,
  onClear,
  active = false,
  comingSoon = false,
  placeholder,
  className,
}: {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  active?: boolean;
  comingSoon?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const uiText = useTranslations('competitor');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className={cn('flex items-center gap-2', className)}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={
            placeholder ?? localizeCompetitorCopy('Search a competitor @handle…', uiText)
          }
          disabled={comingSoon}
          aria-label={uiText('search_competitors_102302e')}
          className="h-8 pl-8 pr-8 text-sm"
        />
        {active && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={uiText('clear_search_3b7ea51')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {comingSoon ? (
        <Badge variant="secondary" className="shrink-0 text-2xs">
          {uiText('coming_soon_4f7d640')}
        </Badge>
      ) : null}
    </form>
  );
}

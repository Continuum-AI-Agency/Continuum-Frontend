'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { competitorStateLabel } from '@/i18n/competitorCopy';
import { useCompetitorSmartSearch } from '@/lib/api/competitorSpy';
import { compactCount, initials, tileStyle } from './brandVisuals';

// foreplay-style "Discovery" command palette: one query across the brand's
// tracked competitors (grouped with ad counts) and their cached ads (copy/hook
// matches), plus an inline "search Meta & track a new brand" action. Results are
// server-driven, so cmdk's client filtering is disabled (shouldFilter=false).
const COMMAND_DIALOG_CLASS =
  '[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5';

export function CompetitorSearchPalette({
  brandId,
  open,
  onOpenChange,
  onSelectCompetitor,
  onTrackNew,
}: {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCompetitor: (competitorId: string) => void;
  onTrackNew: (query: string) => void;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const [raw, setRaw] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setTerm(raw.trim()), 250);
    return () => clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    if (!open) {
      setRaw('');
      setTerm('');
    }
  }, [open]);

  const { data, isFetching } = useCompetitorSmartSearch(brandId, term);
  const brands = data?.brands ?? [];
  const ads = data?.ads ?? [];
  const ready = term.length >= 2;

  function pickCompetitor(competitorId: string): void {
    onSelectCompetitor(competitorId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{uiText('search_competitors_102302e')}</DialogTitle>
          <DialogDescription>
            {uiText('search_tracked_competitors_and_their_cached_a_7210d2d')}
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className={COMMAND_DIALOG_CLASS}>
          <CommandInput
            value={raw}
            onValueChange={setRaw}
            placeholder={uiText('search_competitors_ad_copy_or_a_new_brand_161f04e')}
          />
          <CommandList>
            {!ready ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {uiText('search_across_your_tracked_competitors_and_th_ba28d62')}
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {isFetching ? uiText('searching_c31723a') : uiText('no_matches_d6572bd')}
                </CommandEmpty>

                {brands.length > 0 ? (
                  <CommandGroup heading={uiText('m_ecd05348c2')}>
                    {brands.map((brand) => (
                      <CommandItem
                        key={brand.competitorId}
                        value={`brand-${brand.competitorId}`}
                        onSelect={() => pickCompetitor(brand.competitorId)}
                      >
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-medium"
                          style={tileStyle(brand.name)}
                          aria-hidden
                        >
                          {initials(brand.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {brand.name}
                          </span>
                          {brand.handle ? (
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {brand.handle}
                            </span>
                          ) : null}
                        </span>
                        <CommandShortcut className="font-mono tabular-nums">
                          {uiText('m_472885fe16', {
                            count: brand.adCount ?? 0,
                            amount: compactCount(brand.adCount, uiLocale) ?? '0',
                          })}
                        </CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}

                {ads.length > 0 ? (
                  <>
                    {brands.length > 0 ? <CommandSeparator /> : null}
                    <CommandGroup heading={uiText('m_13bad3d96f')}>
                      {ads.map((ad) => (
                        <CommandItem
                          key={ad.snapshotId}
                          value={`ad-${ad.snapshotId}`}
                          onSelect={() => pickCompetitor(ad.competitorId)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">
                              {ad.body ?? uiText('no_copy_abbb184')}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {ad.competitorName} · {competitorStateLabel(ad.status, uiText)}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}

                <CommandSeparator />
                <CommandGroup heading={uiText('m_c3cd636a58')}>
                  <CommandItem
                    value={`track-${term}`}
                    onSelect={() => {
                      onTrackNew(term);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center text-base leading-none">
                      +
                    </span>
                    <span className="truncate">
                      {uiText.rich('sentence_63818b393717', { v0: () => term })}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

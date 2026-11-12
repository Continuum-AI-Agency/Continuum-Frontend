'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CampaignOption = {
  id: string;
  name: string;
  status: string;
};

type CampaignIndexDraft = {
  id?: string;
  name: string;
  campaignIds: string[];
};

type CampaignIndexManagerDialogProps = {
  campaigns: CampaignOption[];
  initialValue?: CampaignIndexDraft;
  saving?: boolean;
  onCancel: () => void;
  onSave: (draft: CampaignIndexDraft) => void;
};

export function CampaignIndexManagerDialog({
  campaigns,
  initialValue,
  saving = false,
  onCancel,
  onSave,
}: CampaignIndexManagerDialogProps) {
  const uiText = useTranslations('scale');
  const [name, setName] = React.useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [commandOpen, setCommandOpen] = React.useState(false);

  React.useEffect(() => {
    setName(initialValue?.name ?? '');
    setSelectedCampaignIds(initialValue?.campaignIds ?? []);
  }, [initialValue]);

  const toggleCampaign = React.useCallback((campaignId: string) => {
    setSelectedCampaignIds((current) => {
      if (current.includes(campaignId)) {
        return current.filter((id) => id !== campaignId);
      }
      return Array.from(new Set([...current, campaignId]));
    });
  }, []);

  const canSave = name.trim().length > 0 && selectedCampaignIds.length > 0 && !saving;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleCampaigns = React.useMemo(() => {
    if (!normalizedSearch) return campaigns;
    return campaigns.filter((campaign) => {
      const haystack = [campaign.name, campaign.id, campaign.status].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [campaigns, normalizedSearch]);

  return (
    <div className="rounded-md border border-border/70 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <div className="space-y-2 border-b border-border/70 px-3 py-2.5">
        <p className="text-sm font-semibold">
          {initialValue?.id
            ? uiText('edit_campaign_index_038e002')
            : uiText('create_campaign_index_1b7173d')}
        </p>
        <p className="text-xs text-muted-foreground">
          {uiText('command_based_selection_search_toggle_campaig_685cf4e')}
        </p>
        <Input
          id="campaign-index-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={uiText('q1_core_portfolio_2420007')}
          maxLength={120}
          className="h-8 text-xs"
        />
      </div>

      <Command className="rounded-none bg-transparent">
        <CommandInput
          placeholder={uiText('search_campaigns_by_name_id_status_e8fa545')}
          value={search}
          onValueChange={setSearch}
          onFocus={() => setCommandOpen(true)}
          onBlur={() => setCommandOpen(false)}
          className="h-9 text-xs"
        />
        {commandOpen ? (
          <CommandList className="max-h-[320px]" onMouseDown={(event) => event.preventDefault()}>
            <CommandEmpty>{uiText('no_campaign_matches_this_search_289a8e4')}</CommandEmpty>
            <CommandGroup
              heading={uiText('campaigns_selected_count', {
                count: selectedCampaignIds.length,
              })}
            >
              {visibleCampaigns.map((campaign) => {
                const selected = selectedCampaignIds.includes(campaign.id);

                return (
                  <CommandItem
                    key={campaign.id}
                    value={`${campaign.name} ${campaign.id} ${campaign.status}`}
                    keywords={[campaign.id, campaign.status]}
                    onSelect={() => toggleCampaign(campaign.id)}
                    className="cursor-pointer gap-2 py-2"
                  >
                    <span
                      className={cn(
                        'inline-flex h-4 w-4 items-center justify-center rounded border border-border',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-background',
                      )}
                      aria-hidden="true"
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="truncate text-xs">{campaign.name}</span>
                    <span className="ml-auto text-2xs uppercase text-muted-foreground">
                      {campaign.status}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        ) : null}
      </Command>

      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          {uiText('cancel_19766ed')}
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() =>
            onSave({
              id: initialValue?.id,
              name: name.trim(),
              campaignIds: selectedCampaignIds,
            })
          }
          disabled={!canSave}
        >
          {saving
            ? uiText('saving_dc85af8')
            : initialValue?.id
              ? uiText('save_index_8baa71b')
              : uiText('create_index_fd80ea5')}
        </Button>
      </div>
    </div>
  );
}

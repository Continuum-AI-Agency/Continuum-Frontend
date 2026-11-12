'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Campaign = {
  id: string;
  name: string;
  status: string;
  spend?: number;
  roas?: number;
};

type CampaignListProps = {
  brandId: string;
  adAccountId: string | null;
  onSelectCampaign: (campaignId: string) => void;
};

export function CampaignList({ brandId, adAccountId, onSelectCampaign }: CampaignListProps) {
  const formatUiError = useUiErrorMessage();
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const supabase = createSupabaseBrowserClient();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!adAccountId) {
      setCampaigns([]);
      return;
    }

    let mounted = true;

    async function loadCampaigns() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          throw new Error('No authentication token available');
        }

        const response = await fetch(
          `/api/campaigns?brandId=${encodeURIComponent(brandId)}&adAccountId=${encodeURIComponent(
            adAccountId!,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          throw new Error('Failed to load campaigns.');
        }

        const payload = (await response.json()) as { campaigns?: Campaign[] };

        if (mounted) {
          setCampaigns(payload.campaigns ?? []);
        }
      } catch (err) {
        if (mounted) {
          setError(formatUiError(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadCampaigns();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, adAccountId, formatUiError]);

  if (!adAccountId) {
    return (
      <div className="flex h-64 items-center justify-center border border-dashed border-gray-200 rounded-lg">
        <span className="text-muted-foreground">
          {uiText('select_an_ad_account_to_view_campaigns_62e1cd2')}
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-muted-foreground">{uiText('loading_campaigns_0c8164a')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center border border-dashed border-gray-200 rounded-lg">
        <span className="text-muted-foreground">{uiText('no_campaigns_found_1b93a5e')}</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{uiText('campaign_name_c96fffc')}</TableHead>
            <TableHead>{uiText('status_920e413')}</TableHead>
            <TableHead className="text-right">{uiText('spend_85f3d55')}</TableHead>
            <TableHead className="text-right">{uiText('roas_b81bd97')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow
              key={campaign.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onSelectCampaign(campaign.id)}
            >
              <TableCell className="font-medium">{campaign.name}</TableCell>
              <TableCell>
                <Pill variant={campaign.status === 'ACTIVE' ? 'success' : 'muted'}>
                  {campaign.status}
                </Pill>
              </TableCell>
              <TableCell className="text-right">
                {campaign.spend ? `$${campaign.spend.toLocaleString(uiLocale)}` : '-'}
              </TableCell>
              <TableCell className="text-right">
                {campaign.roas ? formatDecimal(campaign.roas, 2, uiLocale) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

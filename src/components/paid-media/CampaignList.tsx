'use client';

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
          setError(err instanceof Error ? err.message : 'Unable to load campaigns.');
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
  }, [brandId, adAccountId]);

  if (!adAccountId) {
    return (
      <div className="flex h-64 items-center justify-center border border-dashed border-gray-200 rounded-lg">
        <span className="text-muted-foreground">Select an ad account to view campaigns</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-muted-foreground">Loading campaigns...</span>
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
        <span className="text-muted-foreground">No campaigns found</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
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
                {campaign.spend ? `$${campaign.spend.toLocaleString()}` : '-'}
              </TableCell>
              <TableCell className="text-right">
                {campaign.roas ? campaign.roas.toFixed(2) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

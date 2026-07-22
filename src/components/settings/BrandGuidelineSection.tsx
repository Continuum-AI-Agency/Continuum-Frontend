import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RegenerateGuidelineButton } from './RegenerateGuidelineButton';

interface BrandGuidelineSectionProps {
  brandId: string;
}

type GuidelineRow = {
  id: string;
  purpose: string;
  notes: string | null;
  status: string;
  version: number;
  colors: Record<string, unknown> | null;
  logo: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  stationery: Record<string, unknown> | null;
  style_design: Record<string, unknown> | null;
  verbal_identity: Record<string, unknown> | null;
  updated_at: string;
};

export async function BrandGuidelineSection({ brandId }: BrandGuidelineSectionProps) {
  const supabase = await createSupabaseServerClient();

  const { data: guideline } = await supabase
    .schema('brand_profiles')
    .from('brand_guidelines')
    .select(
      'id, purpose, notes, status, version, colors, logo, typography, stationery, style_design, verbal_identity, updated_at',
    )
    .eq('brand_id', brandId)
    .neq('status', 'archived')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle<GuidelineRow>();

  const { data: report } = await supabase
    .schema('brand_profiles')
    .from('brand_reports')
    .select('id')
    .eq('brand_profile_id', brandId)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  const { count: nonReadyCount } = await supabase
    .schema('brand_profiles')
    .from('brand_documents')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    // progress_step column added by 20260528100000_extend_brand_documents; regenerate types after applying
    .neq('progress_step' as never, 'ready' as never);

  const hasReport = Boolean(report);
  const docsReady = (nonReadyCount ?? 0) === 0;
  const blockReason = !hasReport
    ? 'Waiting on brand report to finish.'
    : !docsReady
      ? 'Waiting on document indexing to finish.'
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            {guideline ? `Brand guideline · v${guideline.version}` : 'Brand guideline'}
          </div>
          <p className="text-xs text-muted-foreground">
            {guideline
              ? `Status: ${guideline.status} · Updated ${new Date(guideline.updated_at).toLocaleDateString()}`
              : 'Auto-generated once your brand report and uploaded documents are processed.'}
          </p>
        </div>
        <RegenerateGuidelineButton
          brandId={brandId}
          disabled={!!blockReason}
          blockReason={blockReason}
        />
      </div>
      {guideline ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <GuidelineCard heading="Notes" body={guideline.notes ?? '—'} />
          <GuidelineCard heading="Colors" body={summarize(guideline.colors)} />
          <GuidelineCard heading="Typography" body={summarize(guideline.typography)} />
          <GuidelineCard heading="Logo" body={summarize(guideline.logo)} />
          <GuidelineCard heading="Style & design" body={summarize(guideline.style_design)} />
          <GuidelineCard heading="Verbal identity" body={summarize(guideline.verbal_identity)} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center text-sm text-muted-foreground">
          {blockReason ?? 'Your guideline will appear here once generation completes.'}
        </p>
      )}
    </div>
  );
}

function GuidelineCard({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      <p className="mt-1 text-sm text-foreground whitespace-pre-line line-clamp-6">{body}</p>
    </div>
  );
}

function summarize(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return '—';
  const entries = Object.entries(value)
    .slice(0, 6)
    .map(([k, v]) => {
      const display = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}: ${truncate(display, 80)}`;
    });
  return entries.join('\n');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

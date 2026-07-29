'use client';

import {
  type AudienceGroupPreview,
  audienceGroupPreviewSchema,
  type MetaAudienceGroupMember,
} from '@continuum/contracts';
import * as React from 'react';
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
import type { ToolResultEventData } from '@/lib/jaina/schemas';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const unwrapToolOutput = (output: unknown): Record<string, unknown> | null => {
  const record = asRecord(output);
  const data = asRecord(record?.data);
  return data ?? record;
};

export function extractAudienceGroupApproval(
  toolResults: readonly ToolResultEventData[],
): AudienceGroupPreview | null {
  for (let index = toolResults.length - 1; index >= 0; index -= 1) {
    const result = toolResults[index];
    if (result.name !== 'audience_group_manage' || !result.ok) continue;
    const output = unwrapToolOutput(result.output);
    if (output?.status !== 'approval_required') continue;
    const parsed = audienceGroupPreviewSchema.safeParse(output);
    if (parsed.success) return parsed.data;
  }
  return null;
}

const memberSource = (member: MetaAudienceGroupMember): string => {
  if (member.kind === 'website') return `${member.event} · ${member.retention_days} days`;
  if (member.kind === 'engagement') {
    return `${member.source_type.replace('_', ' ')} · ${member.event.replaceAll('_', ' ')}`;
  }
  return `${Math.round(member.ratio * 100)}% lookalike · ${member.country}`;
};

const targetingSummary = (preview: AudienceGroupPreview): string => {
  const targeting = preview.manifest.targeting;
  const countries = targeting.geo_locations?.countries?.join(', ');
  const ages =
    targeting.age_min || targeting.age_max
      ? `Ages ${targeting.age_min ?? 13}–${targeting.age_max ?? '65+'}`
      : null;
  return [countries ? `Countries ${countries}` : null, ages].filter(Boolean).join(' · ');
};

type AudienceGroupApprovalCardProps = {
  toolResults: readonly ToolResultEventData[];
  isStreaming: boolean;
  onApprove?: (query: string) => void;
};

export function AudienceGroupApprovalCard({
  toolResults,
  isStreaming,
  onApprove,
}: AudienceGroupApprovalCardProps) {
  const preview = React.useMemo(() => extractAudienceGroupApproval(toolResults), [toolResults]);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setSubmitted(false);
  }, [preview?.group_version_id]);

  if (!preview) return null;

  const include = new Set(preview.manifest.include_member_keys);
  const exclude = new Set(preview.manifest.exclude_member_keys);
  const summary = targetingSummary(preview);
  const canApprove = Boolean(onApprove) && !isStreaming && !submitted;

  const approve = () => {
    if (!onApprove || submitted) return;
    setSubmitted(true);
    onApprove(
      `Publish the approved Meta audience group now. Call audience_group_manage with ` +
        `{"action":"publish","group_version_id":"${preview.group_version_id}",` +
        `"approval_token":"${preview.approval_token}"}.`,
    );
  };

  return (
    <Card className="border-violet-500/25 bg-violet-500/[0.035] py-0 [--card-gap:0] [--card-pad:1rem]">
      <CardHeader className="border-b py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Approval required</Badge>
          <Badge variant="outline">Meta audiences</Badge>
        </div>
        <CardTitle className="mt-2 text-base">{preview.manifest.name}</CardTitle>
        <CardDescription>
          Review one exact batch before JANA creates these audience assets in Meta.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 py-4">
        {preview.manifest.members.map((member) => (
          <div
            key={member.key}
            className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-background/70 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{member.name}</p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                {member.kind} · {memberSource(member)}
              </p>
            </div>
            <Badge variant={exclude.has(member.key) ? 'outline' : 'secondary'}>
              {exclude.has(member.key)
                ? 'Exclude'
                : include.has(member.key)
                  ? 'Include'
                  : 'Seed only'}
            </Badge>
          </div>
        ))}

        {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Creates audience assets only. No ad set, campaign, placement, schedule, or budget changes.
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-3 border-t py-3">
        <span className="text-xs text-muted-foreground">Version {preview.version}</span>
        <Button type="button" size="sm" onClick={approve} disabled={!canApprove}>
          {submitted ? 'Publishing…' : 'Approve and publish'}
        </Button>
      </CardFooter>
    </Card>
  );
}

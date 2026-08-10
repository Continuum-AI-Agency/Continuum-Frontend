'use client';
import { ClipboardCopy } from 'lucide-react';

import * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { CreativeAssetDragPayload } from '@/lib/creative-assets/drag';
import {
  getNowLocalDateTimeInputValue,
  isFutureLocalDateTime,
  parseLocalDateTime,
} from '@/lib/organic/scheduling';
import type { DetailedPostTemplate } from '@/lib/organic/types';
import { PlatformPreview } from './PlatformPreview';
import type { PostingState } from './types';

type DailyTemplatesPanelProps = {
  templates: DetailedPostTemplate[];
  postingState: PostingState;
  language: string;
  onCopyCaption: (caption: string) => void;
  onToggleReady: (dayPlatform: string, ready: boolean) => void;
  onScheduleChange: (dayPlatform: string, scheduledAt: string) => void;
  onAssetDrop: (payload: CreativeAssetDragPayload, template: DetailedPostTemplate) => void;
};

export function DailyTemplatesPanel({
  templates,
  postingState,
  language,
  onCopyCaption,
  onToggleReady,
  onScheduleChange,
  onAssetDrop,
}: DailyTemplatesPanelProps) {
  const minScheduleAt = React.useMemo(() => getNowLocalDateTimeInputValue(), []);

  return (
    <div className="rounded-lg border bg-card text-card-foreground">
      <div className="p-4">
        <h2 className="mb-4 text-lg font-semibold">Daily Posting Flow ({language})</h2>
        <div className="flex flex-col gap-4">
          {templates.map((template) => {
            const state = postingState[template.day_platform] ?? {
              ready: false,
              scheduledAt: '',
            };

            const handleDrop = (payload: CreativeAssetDragPayload) => {
              onAssetDrop(payload, template);
            };

            const handleScheduleInputChange = (value: string) => {
              if (!value) {
                onScheduleChange(template.day_platform, '');
                return;
              }

              const parsed = parseLocalDateTime(value);
              if (!parsed) return;
              if (!isFutureLocalDateTime(value)) return;

              onScheduleChange(template.day_platform, value);
            };

            return (
              <div
                key={template.day_platform}
                className="rounded-lg border bg-card text-card-foreground"
              >
                <div className="p-4">
                  <div className="flex flex-col gap-4 items-stretch lg:flex-row">
                    <div className="flex-1 space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{template.day_platform}</span>
                          <span className="text-xs text-muted-foreground">
                            {template.type} • {template.format}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={state.ready}
                            onCheckedChange={(checked) =>
                              onToggleReady(template.day_platform, Boolean(checked))
                            }
                          />
                          <span className="text-xs text-muted-foreground">Ready to publish</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                          <span className="block text-sm font-medium">Creative Idea</span>
                          <span className="block text-sm">{template.creative_idea}</span>
                        </div>
                        <div>
                          <span className="block text-sm font-medium">Caption</span>
                          <span className="mb-2 block text-sm">{template.caption_copy}</span>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => onCopyCaption(template.caption_copy)}
                          >
                            <ClipboardCopy />
                            Copy Caption
                          </Button>
                        </div>
                        <div>
                          <span className="block text-sm font-medium">Schedule</span>
                          <Input
                            type="datetime-local"
                            className="mt-2"
                            value={state.scheduledAt}
                            min={minScheduleAt}
                            onChange={(event) => handleScheduleInputChange(event.target.value)}
                          />
                        </div>
                      </div>

                      <Separator className="my-4" />

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <NarrativeBlock
                          title="Narrative Script"
                          entries={template.narrative_script}
                        />
                        <NarrativeBlock
                          title="Technical Notes"
                          entries={template.technical_script as Record<string, unknown>}
                        />
                        <HashtagBlock hashtags={template.hashtags} />
                      </div>
                    </div>
                    <div className="w-full max-w-md">
                      <PlatformPreview template={template} onAssetDrop={handleDrop} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NarrativeBlock({ title, entries }: { title: string; entries: Record<string, unknown> }) {
  const items = Object.entries(entries ?? {}).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return String(value).trim().length > 0;
  });

  if (items.length === 0) return null;

  return (
    <div>
      <span className="block text-sm font-medium">{title}</span>
      <div className="flex flex-col gap-2 mt-2">
        {items.map(([key, value]) => (
          <div key={key}>
            <span className="block text-xs text-muted-foreground">{formatKey(key)}</span>
            {Array.isArray(value) ? (
              <div className="flex flex-col gap-1">
                {value.map((item, index) => (
                  <span key={`${key}-${index}`} className="text-sm">
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm">{String(value)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HashtagBlock({ hashtags }: { hashtags: DetailedPostTemplate['hashtags'] }) {
  const groups: Array<{ label: string; items: string[] }> = [
    { label: 'High competition', items: hashtags.high_competition ?? [] },
    { label: 'Medium competition', items: hashtags.medium_competition ?? [] },
    { label: 'Low competition', items: hashtags.low_competition ?? [] },
  ];

  return (
    <div>
      <span className="block text-sm font-medium">Hashtags</span>
      <div className="flex flex-col gap-2 mt-2">
        {groups.map((group) => (
          <div key={group.label}>
            <span className="block text-xs text-muted-foreground">{group.label}</span>
            <div className="flex gap-2 flex-wrap">
              {group.items.length === 0 ? (
                <span className="text-sm text-muted-foreground">None</span>
              ) : (
                group.items.map((tag) => (
                  <Pill key={tag} variant="violet">
                    #{tag.replace(/^#/, '')}
                  </Pill>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

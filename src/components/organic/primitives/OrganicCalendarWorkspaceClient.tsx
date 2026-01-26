"use client"

import * as React from "react"
import {
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core"
import { useCalendarStore, type GridSlot } from "@/lib/organic/store"
import { ORGANIC_PLATFORM_KEYS, type OrganicPlatformKey } from "@/lib/organic/platforms"
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicPlatformTag,
  OrganicTrendType,
} from "./types"
import type { Trend } from "@/lib/organic/trends"
import { CalendarDndContext } from "./CalendarDndContext"
import { TimeGridCanvas } from "./TimeGridCanvas"
import { WorkspacePanel } from "./WorkspacePanel"
import { CalendarDraftCard } from "./CalendarDraftCard"

type DetailedPostTemplate = {
  slotId: string
  schedule: GridSlot["schedule"]
  platform: GridSlot["platform"]
  strategy: GridSlot["strategy"]
  contentPlan: GridSlot["contentPlan"]
  creative?: {
    creativeIdea?: string | null
    narrative?: {
      hook?: string | null
      interrupt?: string | null
      context?: string | null
      openLoop?: string | null
      explanation?: string | null
      value?: string | null
      cta?: string | null
      slideBySlideBreakdown?: string[] | null
    } | null
  } | null
  copy?: {
    caption?: string | null
    hashtags?: {
      high?: string[] | null
      medium?: string[] | null
      low?: string[] | null
    } | null
  } | null
  localization?: {
    language?: string | null
  } | null
}

const DEFAULT_PROMPT = {
  id: "organic-default",
  name: "Organic default",
  description: "Continuum organic planning prompt.",
  content: "Generate a week of organic social drafts for the connected platforms.",
  source: "default",
} as const

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function mapTimeOfDay(timeLabel: string): "morning" | "afternoon" | "evening" {
  const trimmed = timeLabel.toLowerCase()
  const match = trimmed.match(/(\d+)(?::(\d+))?\s*(am|pm)/)
  if (!match) return "morning"
  const hour = Number(match[1] ?? 9)
  const isPm = match[3] === "pm"
  const normalizedHour = isPm && hour < 12 ? hour + 12 : hour % 24
  if (normalizedHour >= 17) return "evening"
  if (normalizedHour >= 12) return "afternoon"
  return "morning"
}

function resolveTimeLabel(
  timeOfDay: string | null | undefined,
  fallbackTimes: string[]
): string {
  if (!timeOfDay) return fallbackTimes[0] ?? "9:00 AM"
  const mapping: Record<string, string> = {
    morning: "9:00 AM",
    afternoon: "1:00 PM",
    evening: "6:00 PM",
  }
  return mapping[timeOfDay] ?? fallbackTimes[0] ?? "9:00 AM"
}

function mapPlatformTag(name: string): OrganicPlatformTag {
  return name === "linkedin" ? "linkedin" : "instagram"
}

async function streamNdjson<T>(
  response: Response,
  onItem: (item: T) => void
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parsed = parseJsonSafely<T>(trimmed)
      if (parsed) onItem(parsed)
    }
  }

  const tail = buffer.trim()
  if (tail.length > 0) {
    const parsed = parseJsonSafely<T>(tail)
    if (parsed) onItem(parsed)
  }
}

type OrganicCalendarWorkspaceClientProps = {
  days: OrganicCalendarDay[]
  steps: OrganicCreationStep[]
  editorSlides: OrganicEditorSlide[]
  trendTypes: OrganicTrendType[]
  trends?: Trend[]
  activePlatforms?: OrganicPlatformKey[]
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>
  maxTrendSelections?: number
  brandProfileId?: string
  userId?: string
  instagramAccountId?: string
  initialSelectedDraftId?: string | null
}

export function OrganicCalendarWorkspaceClient({
  days: initialDays,
  steps,
  editorSlides,
  trendTypes,
  trends = [],
  activePlatforms = [],
  platformAccountIds = {},
  maxTrendSelections,
  brandProfileId,
  userId,
  instagramAccountId,
  initialSelectedDraftId,
}: OrganicCalendarWorkspaceClientProps) {
  const {
    days: calendarDays,
    setDays: setCalendarDays,
    unscheduledDrafts,
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    selectedTrendIds,
    toggleTrend,
    gridStatus,
    setGridStatus,
    setGridProgress,
    setGridError,
    setGridJobId,
    addDraft,
    moveDraft,
    setGhosts,
    updateDraft: updateDraftById,
  } = useCalendarStore()



  const [activeDragDraft, setActiveDragDraft] = React.useState<OrganicCalendarDraft | null>(null)

  React.useEffect(() => {
    if (calendarDays.length === 0) {
      setCalendarDays(initialDays)
    }
  }, [initialDays, calendarDays.length, setCalendarDays])

  const drafts = React.useMemo(
    () => [...calendarDays.flatMap((day) => day.slots), ...unscheduledDrafts],
    [calendarDays, unscheduledDrafts]
  )

  const resolveDayMeta = React.useCallback(

    (dayId: string) => calendarDays.find((day) => day.id === dayId) ?? null,
    [calendarDays]
  )

  const buildDraftFromSlot = React.useCallback(
    (slot: GridSlot): OrganicCalendarDraft => {
      const day = resolveDayMeta(slot.schedule.dayId)
      const timeLabel = resolveTimeLabel(slot.schedule.timeOfDay ?? null, day?.suggestedTimes ?? [])
      const title = slot.contentPlan.titleTopic ?? slot.contentPlan.type ?? "Planned draft"
      const summary = slot.strategy.objective ?? slot.contentPlan.type ?? "Planned draft"
      const dateLabel = day ? `${day.label}, ${day.dateLabel}` : slot.schedule.dayId

      return {
        id: slot.slotId,
        title,
        summary,
        timeLabel,
        dateLabel,
        status: "draft",
        platforms: [mapPlatformTag(slot.platform.name)],
        format: slot.contentPlan.format ?? slot.contentPlan.type ?? "Draft",
        objective: slot.strategy.objective ?? "Draft",
        captionPreview: "Details incoming.",
        tags: slot.tags?.trendIds ?? [],
        mediaCount: slot.contentPlan.numSlides ?? 1,
      }
    },
    [resolveDayMeta]
  )

  const applyTemplateToDraft = React.useCallback(
    (draft: OrganicCalendarDraft, template: DetailedPostTemplate): OrganicCalendarDraft => {
      const day = resolveDayMeta(template.schedule.dayId)
      return {
        ...draft,
        title: template.contentPlan.titleTopic ?? draft.title,
        summary: template.creative?.creativeIdea ?? draft.summary,
        timeLabel: resolveTimeLabel(template.schedule.timeOfDay ?? null, day?.suggestedTimes ?? []),
        dateLabel: day ? `${day.label}, ${day.dateLabel}` : draft.dateLabel,
        status: "draft",
        format: template.contentPlan.format ?? draft.format,
        objective: template.strategy.objective ?? draft.objective,
        captionPreview: template.copy?.caption ?? draft.captionPreview,
        tags: template.copy?.hashtags?.high ?? draft.tags,
        mediaCount: template.contentPlan.numSlides ?? draft.mediaCount,
      }
    },
    [resolveDayMeta]
  )

  const handleAutoSort = React.useCallback(async () => {
    const schedule = {
      "Mon": "instagram",
      "Tue": "linkedin",
      "Wed": "instagram",
      "Thu": "linkedin",
      "Fri": "instagram",
      "Sat": "linkedin"
    } as const;

    let trendIndex = 0;
    const itemsToSchedule = [...selectedTrendIds];
    
    if (itemsToSchedule.length === 0 && trends.length > 0) {
       itemsToSchedule.push(...trends.slice(0, 6).map(t => t.id));
    }

    if (itemsToSchedule.length === 0) return;

    setGridStatus("running");
    setGridProgress({ percent: 0, message: "Auto-sorting schedule..." });

    for (const day of calendarDays) {
      if (day.label === "Sun") {
          const newsletterId = `newsletter-${day.id}`;
          const alreadyExists = day.slots.some(s => s.id === newsletterId);
          if (!alreadyExists) {
            addDraft(day.id, {
                id: newsletterId,
                title: "Weekly Newsletter",
                summary: "Distill the week's top insights into an email.",
                timeLabel: "10:00 AM",
                dateLabel: `${day.label}, ${day.dateLabel}`,
                status: "draft",
                platforms: ["instagram"],
                format: "Newsletter",
                objective: "Retention",
                captionPreview: "Drafting your weekly recap...",
                tags: ["newsletter"],
                mediaCount: 1,
            });
          }
          continue;
      }

      const dayName = day.label as keyof typeof schedule;
      const platform = schedule[dayName];
      
      if (platform && itemsToSchedule[trendIndex]) {
        const trendId = itemsToSchedule[trendIndex];
        const accountId = platformAccountIds[platform];
        
        if (accountId) {
           setGhosts(day.id, (useCalendarStore.getState().ghosts[day.id] || 0) + 1);
           
           const singlePlatformIds = { [platform]: accountId };
           const payload = {
              platformAccountIds: singlePlatformIds,
              dayId: day.id,
              timeOfDay: "morning",
              language: "English",
              selectedTrendIds: [trendId],
           };

           fetch("/api/organic/generate-slot", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
           }).then(async (response) => {
              if (response.ok) {
                 await streamNdjson<DetailedPostTemplate>(response, (template) => {
                    const draft = buildDraftFromSlot({
                      slotId: template.slotId,
                      schedule: template.schedule,
                      platform: template.platform,
                      strategy: template.strategy,
                      contentPlan: template.contentPlan,
                      tags: { trendIds: [trendId] }
                    });
                    const finalDraft = applyTemplateToDraft(draft, template);
                    addDraft(day.id, finalDraft);
                 });
              }
           }).finally(() => {
              setGhosts(day.id, Math.max(0, (useCalendarStore.getState().ghosts[day.id] || 0) - 1));
           });

           trendIndex = (trendIndex + 1) % itemsToSchedule.length;
        }
      }
    }
    
    setGridStatus("complete");
  }, [calendarDays, platformAccountIds, selectedTrendIds, trends, addDraft, buildDraftFromSlot, setGhosts, applyTemplateToDraft]);

  const handleGenerateDrafts = async () => {
    setGridStatus("running")
    setGridProgress({ percent: 0, message: "Initializing agent..." })
    setGridError(null)

    // Check for seeded placeholders
    const seededPlaceholders = drafts.filter(d => d.status === "placeholder" && d.seedTrendId);

    if (seededPlaceholders.length > 0) {
      setGridProgress({ percent: 0, message: `Generating ${seededPlaceholders.length} seeded slots...` });
      
      let completed = 0;
      for (const placeholder of seededPlaceholders) {
        const dayId = calendarDays.find(day => day.slots.some(s => s.id === placeholder.id))?.id;
        if (!dayId) continue;

        const payload = {
          platformAccountIds: { [placeholder.platforms[0]]: placeholder.targetAccountId },
          dayId,
          timeOfDay: mapTimeOfDay(placeholder.timeLabel),
          language: "English",
          selectedTrendIds: [placeholder.seedTrendId!],
        };

        try {
          const response = await fetch("/api/organic/generate-slot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            await streamNdjson<DetailedPostTemplate>(response, (template) => {
              updateDraftById(placeholder.id, (d) => applyTemplateToDraft(d, template));
            });
          }
        } catch (e) {
          console.error(`Failed to generate seeded slot ${placeholder.id}`, e);
        }
        
        completed++;
        setGridProgress({ 
          percent: Math.round((completed / seededPlaceholders.length) * 100), 
          message: `Generated ${completed}/${seededPlaceholders.length} slots` 
        });
      }
      
      setGridStatus("complete");
      return;
    }

    // Default full grid generation
    try {
      const response = await fetch("/api/organic/generate-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformAccountIds,
          language: "English",
          intent: "brand_quality",
          selectedTrendIds,
          prompt: DEFAULT_PROMPT,
        }),
      })

      if (!response.ok) throw new Error("Failed to start generation")

      await streamNdjson<{
        type: string
        slot?: GridSlot
        progress?: number
        total?: number
        dayId?: string
        draft?: Partial<OrganicCalendarDraft>
      }>(response, (event) => {
        if (event.type === "progress") {
          setGridProgress({
            percent: Math.round(((event.progress ?? 0) / (event.total ?? 1)) * 100),
            message: `Generating slot ${event.progress}/${event.total}`,
          })
        } else if (event.type === "ghost" && event.dayId) {
          setGhosts(event.dayId, 1)
        } else if (event.type === "slot" && event.slot) {
          const draft = buildDraftFromSlot(event.slot)
          addDraft(event.slot.schedule.dayId, draft)
          setGhosts(event.slot.schedule.dayId, 0)
        } else if (event.type === "complete") {
          setGridStatus("complete")
        }
      })
    } catch (error) {
      console.error(error)
      setGridError("Generation failed. Please try again.")
      setGridStatus("error")
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const draftId = event.active.id as string
    const draft = drafts.find((d) => d.id === draftId)
    if (draft) setActiveDragDraft(draft)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragDraft(null)
    const { active, over } = event
    if (!over) return

    const draftId = active.id as string
    const overId = over.id as string

    const targetDay = calendarDays.find(d => d.id === overId)
    if (targetDay) {
      moveDraft(draftId, targetDay.id)
    }
  }

  const formatTimeLabel = (isoTime: string) => {
    const [h, m] = isoTime.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  const handleRegenerate = React.useCallback(async (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId)
    if (!draft) return

    updateDraftById(draftId, (d) => ({ ...d, status: "streaming" }))
    const dayId = calendarDays.find(d => d.slots.some(s => s.id === draftId))?.id
    if (!dayId) return

    try {
      const response = await fetch("/api/organic/generate-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformAccountIds,
          dayId,
          timeOfDay: mapTimeOfDay(draft.timeLabel),
          language: "English",
          selectedTrendIds: draft.tags,
        }),
      })
      if (response.ok) {
        await streamNdjson<DetailedPostTemplate>(response, (template) => {
          updateDraftById(draftId, (d) => applyTemplateToDraft(d, template))
        })
      }
    } catch (e) {
      updateDraftById(draftId, (d) => ({ ...d, status: "draft" }))
    }
  }, [drafts, calendarDays, platformAccountIds, updateDraftById, applyTemplateToDraft])

  const handleNativeDrop = React.useCallback(async (dayId: string, time: string, data: any) => {
    if (data.type === "trend" || data.type === "question") {
      const trendId = data.trendId;
      const trendTitle = data.title || "Selected topic";
      if (!trendId) return;

      const targetDay = calendarDays.find((day) => day.id === dayId);
      if (!targetDay) return;

      // Determine platform based on Beta Launch schedule
      const scheduleMap: Record<string, OrganicPlatformKey> = {
        "Mon": "instagram",
        "Tue": "linkedin",
        "Wed": "instagram",
        "Thu": "linkedin",
        "Fri": "instagram",
        "Sat": "linkedin",
        "Sun": "instagram", // Sunday is Newsletter/Recap, use IG as default for now
      };

      const dayName = targetDay.label;
      const platform = (scheduleMap[dayName] || "instagram") as OrganicPlatformTag;
      const accountId = platformAccountIds[platform as OrganicPlatformKey];

      const seededDraft: OrganicCalendarDraft = {
        id: `seeded-${Date.now()}`,
        title: trendTitle,
        summary: `Queued for generation from "${trendTitle}".`,
        timeLabel: formatTimeLabel(time),
        dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
        status: "placeholder",
        platforms: [platform],
        format: "Draft",
        objective: "Generation Seed",
        captionPreview: "Click Generate to construct this post.",
        tags: [trendId],
        mediaCount: 1,
        seedTrendId: trendId,
        targetAccountId: accountId,
      };

      addDraft(dayId, seededDraft);
    }
  }, [calendarDays, platformAccountIds, addDraft]);

  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden">
      <CalendarDndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragOverlay={
          activeDragDraft ? (
            <div className="w-[200px] opacity-80 rotate-3 cursor-grabbing">
              <CalendarDraftCard
                draft={activeDragDraft}
                isSelected={false}
                isMultiSelected={false}
                onSelect={() => {}}
                onToggleSelection={() => {}}
              />
            </div>
          ) : null
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-6 h-full p-2">
          <div className="min-w-0 h-full overflow-hidden">
            <TimeGridCanvas
              days={calendarDays}
              selectedDraftId={selectedDraftId}
              selectedDraftIds={selectedDraftIds}
              onSelectDraft={setSelectedDraftId}
              onToggleSelection={toggleDraftSelection}
              onRegenerate={handleRegenerate}
              onBuild={handleGenerateDrafts}
              onNativeDrop={handleNativeDrop}
            />
          </div>
          <div className="h-full min-w-0 overflow-hidden">
            <WorkspacePanel
              trends={trends}
              selectedTrendIds={selectedTrendIds}
              activePlatforms={activePlatforms}
              maxTrendSelections={maxTrendSelections}
              onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
              onGenerate={handleGenerateDrafts}
              viewMode="week"
              onViewModeChange={() => {}}
              onAutoSort={handleAutoSort}
            />
          </div>
        </div>
      </CalendarDndContext>
    </div>
  )
}

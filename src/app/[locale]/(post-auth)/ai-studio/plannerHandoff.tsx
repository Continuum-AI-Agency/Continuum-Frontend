'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/errors';
import { request } from '@/lib/api/http';
import {
  buildAiStudioStorageKey,
  type PlannerAiStudioHandoff,
  plannerAiStudioHandoffSchema,
} from '@/lib/organic/ai-studio-bridge';
import { cn } from '@/lib/utils';

// Kept out of AIStudioClient: a lazy-catalog boundary module exports only its component
// (scripts/i18n/scopes.mjs), so the planner handoff lives beside it.

function readOrganicPlannerSeedContext(
  draftId: string,
  brandProfileId: string,
): PlannerAiStudioHandoff | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(buildAiStudioStorageKey(draftId));
  if (!raw) return null;

  try {
    const parsed = plannerAiStudioHandoffSchema.safeParse(JSON.parse(raw));
    return parsed.success &&
      parsed.data.brandProfileId === brandProfileId &&
      parsed.data.draftId === draftId
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

/**
 * Does the planner draft still exist? Read through the same single-draft route the chat
 * cards use. `null` is "could not tell" (offline, 5xx): only a 404 is proof it is gone.
 */
export async function plannerDraftExists(backendDraftId: string): Promise<boolean | null> {
  try {
    await request({ path: `/api/organic/calendar/drafts/${encodeURIComponent(backendDraftId)}` });
    return true;
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? false : null;
  }
}

export type PlannerHandoff =
  | { status: 'none' }
  | { status: 'ready'; seed: PlannerAiStudioHandoff }
  | { status: 'missing' };

/**
 * What a `source=organic-planner&draftId=…` link actually hands the canvas. A missing or
 * foreign seed, a seed for a draft that was never saved, or a draft deleted since is
 * `missing` — the page says so instead of opening an empty canvas that cannot apply back.
 */
export async function resolvePlannerHandoff(input: {
  source: string | null;
  draftId: string | null;
  brandProfileId: string;
  readSeed?: (draftId: string, brandProfileId: string) => PlannerAiStudioHandoff | null;
  draftExists?: (backendDraftId: string) => Promise<boolean | null>;
}): Promise<PlannerHandoff> {
  if (input.source !== 'organic-planner' || !input.draftId) return { status: 'none' };
  const seed = (input.readSeed ?? readOrganicPlannerSeedContext)(
    input.draftId,
    input.brandProfileId,
  );
  if (!seed?.backendDraftId) return { status: 'missing' };
  const exists = await (input.draftExists ?? plannerDraftExists)(seed.backendDraftId);
  return exists === false ? { status: 'missing' } : { status: 'ready', seed };
}

export function PlannerDraftMissingNotice() {
  const translateUi = useUiTranslations('studio');
  const organicText = useUiTranslations('organic');
  return (
    <div
      role="alert"
      data-slot="planner-draft-missing"
      className="mx-4 mt-2 flex flex-wrap items-center gap-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white">
          {translateUi('this_post_isn_t_saved_anymore_0f02a6a')}
        </p>
        <p className="text-xs text-amber-100/80">
          {translateUi('its_draft_was_deleted_from_the_calendar_or_ne_eabdf53')}
        </p>
      </div>
      <Link
        href="/organic?tab=planner"
        className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
      >
        {organicText('open_calendar_35cdec8')}
      </Link>
    </div>
  );
}

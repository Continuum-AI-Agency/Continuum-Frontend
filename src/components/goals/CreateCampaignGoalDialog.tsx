'use client';

import {
  CAMPAIGN_CREATION_TEMPLATE_ID,
  type CampaignArtifactType,
  type CreateGoalRequest,
  campaignArtifactTypeSchema,
  createGoalRequestSchema,
  getGoalTemplate,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { createGoal } from '@/lib/api/goals.client';

const campaignTemplate = getGoalTemplate(CAMPAIGN_CREATION_TEMPLATE_ID);
if (!campaignTemplate) {
  throw new Error('The campaign creation Goal template is unavailable.');
}

const selectableArtifacts = campaignTemplate.artifacts
  .filter((artifact) => artifact.requirement !== 'core')
  .map((artifact) => ({
    ...artifact,
    id: campaignArtifactTypeSchema.parse(artifact.id),
  }));

export type CampaignGoalDraft = {
  title: string;
  objective: string;
  successCriteria: string;
  visibility: 'private' | 'brand';
  activatedArtifactIds: CampaignArtifactType[];
};

export function buildCampaignGoalRequest(
  brandId: string,
  draft: CampaignGoalDraft,
): CreateGoalRequest {
  const successCriteria = draft.successCriteria
    .split('\n')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement, index) => ({
      id: `criterion-${index + 1}`,
      statement,
    }));

  return createGoalRequestSchema.parse({
    brandId,
    kind: 'campaign-creation',
    title: draft.title,
    objective: draft.objective,
    successCriteria,
    visibility: draft.visibility,
    invitedMemberIds: [],
    templateId: CAMPAIGN_CREATION_TEMPLATE_ID,
    activatedArtifactIds: draft.activatedArtifactIds,
  });
}

type CreateCampaignGoalDialogProps = {
  brandId: string;
  compact?: boolean;
};

const initialDraft = (): CampaignGoalDraft => ({
  title: '',
  objective: '',
  successCriteria: '',
  visibility: 'brand',
  activatedArtifactIds: [],
});

export function CreateCampaignGoalDialog({
  brandId,
  compact = false,
}: CreateCampaignGoalDialogProps) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('dashboard');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<CampaignGoalDraft>(initialDraft);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const toggleArtifact = (artifactId: CampaignArtifactType, enabled: boolean) => {
    setDraft((current) => ({
      ...current,
      activatedArtifactIds: enabled
        ? [...current.activatedArtifactIds, artifactId]
        : current.activatedArtifactIds.filter((id) => id !== artifactId),
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await createGoal(buildCampaignGoalRequest(brandId, draft));
      await queryClient.invalidateQueries({ queryKey: ['goals', brandId] });
      setDraft(initialDraft());
      setOpen(false);
      router.push(`/goals/${encodeURIComponent(created.goal.id)}`);
    } catch (cause) {
      setError(getUiErrorMessage(cause));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant={compact ? 'secondary' : 'default'}>
            <Plus className="size-3.5" />
            {compact ? uiText('m_6403f2b7eb') : uiText('m_010e2a2e7f')}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{uiText('create_a_campaign_goal_d7754eb')}</DialogTitle>
            <DialogDescription>
              {uiText('define_the_campaign_outcome_here_continuum_wi_1490b56')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-5">
            <div className="grid gap-2">
              <Label htmlFor="campaign-goal-title">{uiText('campaign_name_e092a1f')}</Label>
              <Input
                id="campaign-goal-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                placeholder={uiText('q4_acquisition_campaign_58744da')}
                maxLength={300}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="campaign-goal-objective">
                {uiText('business_objective_6c4aa05')}
              </Label>
              <Textarea
                id="campaign-goal-objective"
                value={draft.objective}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, objective: event.target.value }))
                }
                placeholder={uiText('describe_the_audience_business_outcome_offer__42d4c7e')}
                rows={4}
                maxLength={4_000}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="campaign-goal-criteria">{uiText('definition_of_done_04a987b')}</Label>
              <Textarea
                id="campaign-goal-criteria"
                value={draft.successCriteria}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, successCriteria: event.target.value }))
                }
                placeholder={uiText('one_measurable_criterion_per_line_launch_appr_5b1e5ad')}
                rows={4}
                required
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {uiText('enter_one_measurable_success_criterion_per_li_8ef6b08')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="campaign-goal-visibility">{uiText('access_ec5ba0a')}</Label>
              <select
                id="campaign-goal-visibility"
                value={draft.visibility}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    visibility: event.target.value as CampaignGoalDraft['visibility'],
                  }))
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="brand">{uiText('brand_team_04d3e5e')}</option>
                <option value="private">{uiText('only_me_bdc0857')}</option>
              </select>
            </div>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">
                {uiText('additional_campaign_artifacts_d92e634')}
              </legend>
              <p className="text-xs leading-5 text-muted-foreground">
                {uiText('activate_the_documents_this_campaign_actually_54a99f7')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectableArtifacts.map((artifact) => (
                  <label
                    key={artifact.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={draft.activatedArtifactIds.includes(artifact.id)}
                      onChange={(event) => toggleArtifact(artifact.id, event.target.checked)}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium">{artifact.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {artifact.activation.prompt}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {uiText('cancel_19766ed')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {uiText.rich('sentence_4b50e0819257', {
                v0: () => (isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : null),
              })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  Brain,
  Check,
  FileText,
  Library,
  ListChecks,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  goalChecklistBlocker,
  goalChecklistCopy,
  goalChecklistStatus,
  goalChecklistSummary,
} from '@/lib/goals/checklistCopy';
import type { GoalArtifactView } from '@/lib/goals/models';
import { GoalStatusPill } from './GoalStatusPill';

type GoalArtifactEditorProps = {
  artifact: GoalArtifactView | null;
  isSaving: boolean;
  saveError: string | null;
  onSave: (input: {
    artifactId: string;
    markdown: string;
    expectedRevision: number;
  }) => Promise<boolean>;
  onAction: (input: {
    artifactId: string;
    versionId: string;
    action: 'approve' | 'changes' | 'accept' | 'promote';
  }) => Promise<void>;
};

export function GoalArtifactEditor({
  artifact,
  isSaving,
  saveError,
  onSave,
  onAction,
}: GoalArtifactEditorProps) {
  const uiText = useTranslations('dashboard');
  const [draft, setDraft] = useState(artifact?.markdown ?? '');
  // Undefined means "the user has not picked a tab" — the tab that suits the artifact wins until
  // then. The derived tab depends on values computed past the early return below, so this stays
  // inline rather than going through useDeferredDefault.
  const [selectedTab, setSelectedTab] = useState<string>();

  useEffect(() => {
    setDraft(artifact?.markdown ?? '');
  }, [artifact?.id, artifact?.markdown]);

  // Switching artifacts clears the pick — the previous tab may not exist on the new one.
  useEffect(() => {
    setSelectedTab(undefined);
  }, [artifact?.id]);

  if (!artifact) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center bg-card/20 p-6">
        <div className="max-w-md text-center">
          <FileText className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">{uiText('select_an_artifact_fc3d77d')}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {uiText('the_case_file_keeps_evidence_in_dependency_or_e39fe31')}
          </p>
        </div>
      </section>
    );
  }

  const original = artifact.markdown ?? '';
  const dirty = draft !== original;
  const structuredDocument = artifact.document ?? null;
  const checklistItems = artifact.checklistItems ?? [];
  const workProducts = artifact.workProducts ?? [];
  const exactVersionValidated = Boolean(
    artifact.headVersionId &&
      artifact.validations?.some(
        (validation) => validation.versionId === artifact.headVersionId && validation.valid,
      ),
  );
  const editable =
    artifact.canEdit && artifact.markdown !== null && artifact.draftRevision !== null;
  const versionId = artifact.headVersionId;

  const saveDraft = async () => {
    if (!editable || artifact.draftRevision === null) return;
    await onSave({
      artifactId: artifact.id,
      markdown: draft,
      expectedRevision: artifact.draftRevision,
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-card/15">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
              {artifact.kindLabel} · {artifact.versionLabel}
            </span>
            <GoalStatusPill status={artifact.status} />
          </div>
          <h2 className="mt-1 truncate text-base font-semibold tracking-tight">{artifact.title}</h2>
          {artifact.alignmentLabel ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{artifact.alignmentLabel}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {versionId &&
          (artifact.status === 'draft' || artifact.status === 'needs_changes') &&
          (!structuredDocument || exactVersionValidated) ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void onAction({ artifactId: artifact.id, versionId, action: 'changes' })
                }
              >
                <RotateCcw className="size-3.5" />
                {uiText('m_bbd0717f18')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void onAction({ artifactId: artifact.id, versionId, action: 'approve' })
                }
              >
                <Check className="size-3.5" />
                {uiText('m_406380acbc')}
              </Button>
            </>
          ) : null}
          {versionId && artifact.status === 'in_review' ? (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                void onAction({ artifactId: artifact.id, versionId, action: 'accept' })
              }
            >
              <Check className="size-3.5" />
              {uiText('m_f1445323b5')}
            </Button>
          ) : null}
          {versionId && artifact.status === 'accepted' && !artifact.promotedToBrandDocumentId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void onAction({ artifactId: artifact.id, versionId, action: 'promote' })
              }
            >
              <Library className="size-3.5" />
              {uiText('m_3aa6257e12')}
            </Button>
          ) : null}
          {editable ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void saveDraft()}
              disabled={!dirty || isSaving}
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {isSaving ? uiText('saving_23e3929') : uiText('save_draft_3de1001')}
            </Button>
          ) : null}
        </div>
      </header>

      {saveError ? (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/5 px-4 py-2">
          <p className="text-xs text-destructive">{saveError}</p>
        </div>
      ) : null}

      <Tabs
        value={selectedTab ?? (editable ? 'edit' : structuredDocument ? 'overview' : 'preview')}
        onValueChange={setSelectedTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border/70 px-4 py-2">
          <TabsList>
            {editable ? <TabsTrigger value="edit">{uiText('edit_464c4ff')}</TabsTrigger> : null}
            {structuredDocument ? (
              <>
                <TabsTrigger value="overview">{uiText('artifact_e06171a')}</TabsTrigger>
                <TabsTrigger value="checklist">{uiText('checklist_7346030')}</TabsTrigger>
                <TabsTrigger value="rationale">{uiText('rationale_58f23be')}</TabsTrigger>
                <TabsTrigger value="raw">{uiText('structured_data_6a2dc31')}</TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="preview">{uiText('preview_324b134')}</TabsTrigger>
            )}
          </TabsList>
        </div>

        {editable ? (
          <TabsContent value="edit" className="min-h-0 flex-1 overflow-y-auto p-0">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={uiText('m_ef4809b018', { v0: String(artifact.title) })}
              spellCheck
              className="min-h-full resize-none rounded-none border-0 bg-transparent px-5 py-5 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
            />
          </TabsContent>
        ) : null}

        {structuredDocument ? (
          <>
            <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-4xl space-y-4">
                <div className="rounded-lg border border-border/70 bg-background/55 p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">
                      {uiText('current_structured_artifact_c17fa49')}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {uiText('this_exact_library_version_is_the_working_aut_9a25627')}
                  </p>
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-5">
                    {JSON.stringify(structuredDocument.data, null, 2)}
                  </pre>
                </div>
                {!exactVersionValidated ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                    {uiText('this_version_has_not_passed_the_complete_sche_a5048d1')}
                  </div>
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="checklist" className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-4xl space-y-2">
                {checklistItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border/70 bg-background/55 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {goalChecklistCopy(item.definition, uiText).label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {goalChecklistCopy(item.definition, uiText).question}
                        </p>
                      </div>
                      <span className="font-mono text-2xs uppercase text-muted-foreground">
                        {goalChecklistStatus(item.status, uiText)}
                      </span>
                    </div>
                    {item.blocker ? (
                      <p className="mt-2 text-xs text-amber-300">
                        {goalChecklistBlocker(item.blocker, uiText)}
                      </p>
                    ) : null}
                    <p className="mt-2 text-2xs text-muted-foreground">
                      {goalChecklistSummary(
                        item.definition.collectionPolicy,
                        item.requestIds.length,
                        item.evidenceIds.length,
                        uiText,
                      )}
                    </p>
                  </div>
                ))}
                {checklistItems.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <ListChecks className="mx-auto mb-3 size-5" />
                    {uiText('m_46f3e43247')}
                  </div>
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="rationale" className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-4xl space-y-3">
                {workProducts.map((result) => (
                  <div
                    key={result.id}
                    className="rounded-lg border border-border/70 bg-background/55 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Brain className="size-4 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {result.rationale?.summary ?? result.outcome}
                      </p>
                    </div>
                    {result.rationale ? (
                      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                        <p>
                          <span className="text-muted-foreground">
                            {uiText('confidence_6422e3e')}
                          </span>
                          <br />
                          {Math.round(result.rationale.confidence * 100)}%
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            {uiText('assumptions_69ef1ef')}
                          </span>
                          <br />
                          {result.rationale.assumptions.join(' · ') ||
                            uiText('none_recorded_aab6c5e')}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            {uiText('tradeoffs_b6d4d27')}
                          </span>
                          <br />
                          {result.rationale.tradeoffs.join(' · ') ||
                            uiText('none_recorded_aab6c5e')}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            {uiText('risks_and_unknowns_99f18ba')}
                          </span>
                          <br />
                          {[...result.rationale.risks, ...result.rationale.unknowns].join(' · ') ||
                            uiText('none_recorded_aab6c5e')}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
                {workProducts.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <Brain className="mx-auto mb-3 size-5" />
                    {uiText('m_4b29970ee4')}
                  </div>
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="raw" className="min-h-0 flex-1 overflow-y-auto p-5">
              <pre className="mx-auto max-w-4xl overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-background/55 p-4 text-xs leading-5">
                {JSON.stringify(structuredDocument, null, 2)}
              </pre>
            </TabsContent>
          </>
        ) : (
          <TabsContent value="preview" className="min-h-0 flex-1 overflow-y-auto p-0">
            <article className="mx-auto min-h-full w-full max-w-4xl border-x border-border/50 bg-background/55 px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
              {draft.trim() ? (
                <SafeMarkdown
                  content={draft}
                  mode="static"
                  className="prose prose-invert prose-sm max-w-none"
                />
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium">
                    {uiText('this_artifact_has_no_written_evidence_yet_1b4da37')}
                  </p>
                </div>
              )}
            </article>
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}

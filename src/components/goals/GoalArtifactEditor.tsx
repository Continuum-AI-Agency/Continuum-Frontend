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
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
  const [draft, setDraft] = useState(artifact?.markdown ?? '');

  useEffect(() => {
    setDraft(artifact?.markdown ?? '');
  }, [artifact?.id, artifact?.markdown]);

  if (!artifact) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center bg-card/20 p-6">
        <div className="max-w-md text-center">
          <FileText className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Select an artifact</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The case file keeps evidence in dependency order. Select an item from the manifest to
            inspect its current reviewed version.
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
                Request changes
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void onAction({ artifactId: artifact.id, versionId, action: 'approve' })
                }
              >
                <Check className="size-3.5" />
                Approve version
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
              Accept artifact
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
              Promote to Brand Knowledge
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
              {isSaving ? 'Saving…' : 'Save draft'}
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
        defaultValue={editable ? 'edit' : structuredDocument ? 'overview' : 'preview'}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border/70 px-4 py-2">
          <TabsList>
            {editable ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
            {structuredDocument ? (
              <>
                <TabsTrigger value="overview">Artifact</TabsTrigger>
                <TabsTrigger value="checklist">Checklist</TabsTrigger>
                <TabsTrigger value="rationale">Rationale</TabsTrigger>
                <TabsTrigger value="raw">Structured data</TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="preview">Preview</TabsTrigger>
            )}
          </TabsList>
        </div>

        {editable ? (
          <TabsContent value="edit" className="min-h-0 flex-1 overflow-y-auto p-0">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`${artifact.title} Markdown draft`}
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
                    <h3 className="text-sm font-semibold">Current structured artifact</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This exact Library version is the working authority. Acceptance is blocked until
                    its enforced checklist validates.
                  </p>
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-5">
                    {JSON.stringify(structuredDocument.data, null, 2)}
                  </pre>
                </div>
                {!exactVersionValidated ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                    This version has not passed the complete schema, provenance, confidence, and
                    stakeholder-authority check. It cannot be accepted.
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
                        <p className="text-sm font-medium">{item.definition.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.definition.question}
                        </p>
                      </div>
                      <span className="font-mono text-2xs uppercase text-muted-foreground">
                        {item.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    {item.blocker ? (
                      <p className="mt-2 text-xs text-amber-300">{item.blocker}</p>
                    ) : null}
                    <p className="mt-2 text-2xs text-muted-foreground">
                      {item.definition.collectionPolicy.replaceAll('_', ' ')}
                      {item.requestIds.length > 0
                        ? ` · ${item.requestIds.length} stakeholder request`
                        : ''}
                      {item.evidenceIds.length > 0
                        ? ` · ${item.evidenceIds.length} evidence source`
                        : ''}
                    </p>
                  </div>
                ))}
                {checklistItems.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <ListChecks className="mx-auto mb-3 size-5" />
                    The artifact checklist is being materialized.
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
                          <span className="text-muted-foreground">Confidence</span>
                          <br />
                          {Math.round(result.rationale.confidence * 100)}%
                        </p>
                        <p>
                          <span className="text-muted-foreground">Assumptions</span>
                          <br />
                          {result.rationale.assumptions.join(' · ') || 'None recorded'}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Tradeoffs</span>
                          <br />
                          {result.rationale.tradeoffs.join(' · ') || 'None recorded'}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Risks and unknowns</span>
                          <br />
                          {[...result.rationale.risks, ...result.rationale.unknowns].join(' · ') ||
                            'None recorded'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
                {workProducts.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <Brain className="mx-auto mb-3 size-5" />
                    Jaina has not submitted a public rationale for this artifact yet.
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
                  <p className="text-sm font-medium">This artifact has no written evidence yet.</p>
                </div>
              )}
            </article>
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}

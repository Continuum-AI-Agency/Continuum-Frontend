'use client';

import {
  type TemplateRevision,
  type TemplateRevisionVariant,
  type TemplateVersionDiffResponse,
  type TemplateVersionMergePreview,
  templateReleaseRequestSchema,
  templateReleaseRollbackRequestSchema,
  templateVersionBranchRequestSchema,
  templateVersionMergeCommitRequestSchema,
  templateVersionRevertRequestSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, GitMerge, History, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  branchTemplateVersion,
  commitTemplateMerge,
  diffTemplateVersions,
  fetchTemplateAuthoringUserId,
  fetchTemplateReleases,
  fetchTemplateVersionCapabilities,
  fetchTemplateVersionCommits,
  fetchTemplateVersionHistory,
  previewTemplateMerge,
  promoteTemplateRelease,
  revertTemplateVersion,
  rollbackTemplateRelease,
} from '@/lib/library/templateSources';
import { invalidateForgeBrand } from './queryKeys';
import { revisionIsReadOnly, selectTemplateRevision } from './revisionSelection';
import { type VariantNode, variantTree } from './variantTree';
import { type VersioningIntent, VersioningIntentJournal } from './versioningIntent';

const nameSchema = z.object({ name: z.string().trim().min(1, 'Name the variant.').max(120) });
const value = (input: unknown) => (input === undefined ? 'From source' : JSON.stringify(input));
const label = (variant: TemplateRevisionVariant) => (variant.original ? 'Original' : variant.name);
const problem = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not complete. Retry with the retained intent.';
const short = (id: string) => id.slice(0, 8);
type Review =
  | { kind: 'restore'; revisionId: string; headId: string; diff: TemplateVersionDiffResponse }
  | {
      kind: 'release' | 'rollback';
      revisionId: string;
      bindingId: string;
      templateKey: string;
      expectedReleaseId: string | null;
      releaseId?: string;
    };

/** Selection is by revision UUID. Inspecting never silently chooses another revision of reused bytes. */
export function VersionControlPanel({
  brandId,
  assetId,
  versionId,
  variants,
  revisionId,
  onOpenRevision,
}: {
  brandId: string;
  assetId: string;
  versionId: string | null;
  variants: TemplateRevisionVariant[];
  revisionId?: string;
  onOpenRevision?: (revision: TemplateRevision) => void | Promise<void>;
}) {
  const initial = selectTemplateRevision(variants, assetId, versionId, revisionId);
  const [selectedId, setSelectedId] = useState(initial?.revision.id ?? '');
  const selected = selectTemplateRevision(variants, assetId, versionId, selectedId || undefined);
  const templateId = variants[0]?.templateId;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'revisions' | 'compare' | 'merge' | 'history' | 'releases'>(
    'revisions',
  );
  const [otherId, setOtherId] = useState('');
  const [diff, setDiff] = useState<TemplateVersionDiffResponse | null>(null);
  const [preview, setPreview] = useState<TemplateVersionMergePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, 'ours' | 'theirs'>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [journal, setJournal] = useState<VersioningIntentJournal | null>(null);
  const [pending, setPending] = useState<VersioningIntent | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const form = useForm({ resolver: zodResolver(nameSchema), defaultValues: { name: '' } });
  const tree = useMemo(() => variantTree(variants), [variants]);
  const capability = useQuery({
    queryKey: ['forge', brandId, 'version-capabilities', assetId],
    queryFn: () => fetchTemplateVersionCapabilities(brandId, assetId),
    retry: false,
  });
  const commits = useQuery({
    queryKey: ['forge', brandId, 'version-commits', assetId],
    queryFn: () => fetchTemplateVersionCommits(brandId, assetId),
    retry: false,
  });
  const history = useQuery({
    queryKey: ['forge', brandId, 'version-history', assetId],
    queryFn: () => fetchTemplateVersionHistory(brandId, assetId),
    enabled: mode === 'history',
    retry: false,
  });
  const releases = useQuery({
    queryKey: ['forge', brandId, 'version-releases', assetId],
    queryFn: () => fetchTemplateReleases(brandId, assetId),
    enabled: mode === 'releases',
    retry: false,
  });
  useEffect(() => {
    let current = true;
    setRecoveryReady(false);
    if (!templateId) return;
    void (async () => {
      const userId = await fetchTemplateAuthoringUserId();
      const store = new VersioningIntentJournal(userId, brandId, templateId);
      const waiting = await store.pending();
      if (current) {
        setJournal(store);
        setPending(waiting);
        setRecoveryReady(true);
      }
    })().catch((cause) => {
      if (current) setError(problem(cause));
    });
    return () => {
      current = false;
    };
  }, [brandId, templateId]);
  const revisions = variants.flatMap((variant) =>
    variant.revisions.map((revision) => ({ variant, revision })),
  );
  const other = revisions.find((item) => item.revision.id === otherId);
  const destinationHead = selected?.variant.draftHeadRevisionId;
  const otherHead = other?.variant.draftHeadRevisionId;
  const previewCurrent =
    preview?.headRevisionId === destinationHead && preview?.sourceHeadRevisionId === otherHead;
  const locked = busy || !recoveryReady || !!pending;
  const editableBranch = selected && !selected.variant.original && !selected.variant.archivedAt;
  const invalidateReview = () => {
    setDiff(null);
    setPreview(null);
    setChoices({});
    setReview(null);
  };
  const select = (id: string) => {
    setSelectedId(id);
    setOtherId('');
    invalidateReview();
    setError(null);
  };
  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const send = async (intent: VersioningIntent) => {
    if (
      !journal ||
      intent.userId !== journal.userId ||
      intent.brandId !== brandId ||
      (await fetchTemplateAuthoringUserId()) !== intent.userId
    )
      throw new Error(
        'This request belongs to another signed-in account. Switch back to retry it.',
      );
    const body = { ...intent.body, brandId: intent.brandId, idempotencyKey: intent.id };
    let saved: TemplateRevision | undefined;
    switch (intent.action) {
      case 'branch':
        saved = (
          await branchTemplateVersion(
            intent.assetId,
            templateVersionBranchRequestSchema.parse(body),
            intent.userId,
          )
        ).revision;
        break;
      case 'merge':
        saved = (
          await commitTemplateMerge(
            intent.assetId,
            templateVersionMergeCommitRequestSchema.parse(body),
            intent.userId,
          )
        ).revision;
        break;
      case 'restore':
        saved = (
          await revertTemplateVersion(
            intent.assetId,
            templateVersionRevertRequestSchema.parse(body),
            intent.userId,
          )
        ).revision;
        break;
      case 'release':
        await promoteTemplateRelease(
          intent.assetId,
          templateReleaseRequestSchema.parse(body),
          intent.userId,
        );
        break;
      case 'rollback':
        await rollbackTemplateRelease(
          intent.assetId,
          templateReleaseRollbackRequestSchema.parse(body),
          intent.userId,
        );
        break;
    }
    await journal.finish(intent.id, 'acknowledged');
    setPending(null);
    invalidateReview();
    if (saved) setSelectedId(saved.id);
    setNotice(
      saved
        ? `Saved revision ${saved.number}. Production is unchanged.`
        : 'Production release updated. Queued renders keep their original pins.',
    );
    await invalidateForgeBrand(queryClient, brandId);
  };
  const mutate = async (action: VersioningIntent['action'], body: Record<string, unknown>) => {
    if (!journal || locked) return;
    const intent = await journal.capture(assetId, action, body);
    setPending(intent);
    await send(intent);
  };
  const mergeInput =
    selected && other
      ? {
          brandId,
          variantId: selected.variant.variantId,
          sourceVariantId: other.variant.variantId,
          expectedHeadRevisionId: selected.variant.draftHeadRevisionId,
          expectedSourceHeadRevisionId: other.variant.draftHeadRevisionId,
        }
      : null;
  const releaseTargets = [
    ...new Map(
      revisions
        .flatMap(({ revision }) => revision.publications)
        .map((target) => [`${target.bindingId}:${target.templateKey}`, target]),
    ).values(),
  ];
  const headFor = (bindingId: string, templateKey: string) =>
    releases.data?.heads.find(
      (head) => head.bindingId === bindingId && head.templateKey === templateKey,
    )?.releaseId ?? null;
  const branchNode = (node: VariantNode) => (
    <li key={node.variant.variantId}>
      <Button
        size="sm"
        variant={selected?.variant.variantId === node.variant.variantId ? 'secondary' : 'ghost'}
        className="h-auto w-full justify-between gap-2 py-2 text-left"
        aria-pressed={selected?.variant.variantId === node.variant.variantId}
        disabled={busy}
        onClick={() => select(node.variant.draftHeadRevisionId)}
      >
        <span className="min-w-0 truncate">{label(node.variant)}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {node.variant.archivedAt ? 'Archived' : node.variant.original ? 'Read-only' : 'Variant'}
        </span>
      </Button>
      {node.children.length > 0 && (
        <ul className="ms-3 border-s border-border ps-2">{node.children.map(branchNode)}</ul>
      )}
    </li>
  );
  return (
    <section aria-label="Version control" className="space-y-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <GitBranch className="size-4" aria-hidden />
            Version control
          </h3>
          <p className="text-xs text-muted-foreground">
            Select a variant, review a revision, then choose what to change. Saving and releasing
            are separate.
          </p>
        </div>
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await invalidateForgeBrand(queryClient, brandId);
            })
          }
        >
          Refresh heads
        </Button>
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
      {pending && (
        <div role="status" className="space-y-2 border-y border-border py-2 text-xs">
          <p>
            Pending {pending.action} request ·{' '}
            <span className="font-mono">{short(pending.id)}</span>. Its exact target and input are
            retained. Retry to recover an uncertain outcome.
          </p>
          <Button size="xs" disabled={busy} onClick={() => void run(() => send(pending))}>
            Retry pending request
          </Button>{' '}
          <Button
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!journal) return;
                await journal.finish(pending.id, 'dismissed');
                setPending(null);
                setNotice(
                  'Retry stopped; its record is retained. Refresh heads and releases to check whether it landed.',
                );
                await invalidateForgeBrand(queryClient, brandId);
              })
            }
          >
            Stop retrying
          </Button>
        </div>
      )}
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(10rem,1fr)_minmax(0,3fr)]">
        <nav aria-label="Template variants" className="min-w-0">
          <ul>{tree.map(branchNode)}</ul>
        </nav>
        <div className="min-w-0 space-y-3 md:border-s md:border-border md:ps-3">
          {!selected ? (
            <p role="status" className="text-xs text-muted-foreground">
              Choose a variant. This source file is reused; a file alone does not identify a branch
              or revision.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="min-w-0 break-words">
                  {label(selected.variant)} · Revision {selected.revision.number}
                </strong>
                <Pill>{revisionIsReadOnly(selected) ? 'Read-only revision' : 'Branch head'}</Pill>
                <span
                  title={selected.revision.id}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {short(selected.revision.id)}
                </span>
              </div>
              {selected.variant.parentRevisionId && (
                <p className="text-xs text-muted-foreground">
                  Branched from {(() => {
                    const parent = revisions.find(
                      (item) => item.revision.id === selected.variant.parentRevisionId,
                    );
                    return parent
                      ? `${label(parent.variant)} · Revision ${parent.revision.number}`
                      : 'an unavailable parent revision';
                  })()} ·{' '}
                  <span className="font-mono" title={selected.variant.parentRevisionId}>
                    {short(selected.variant.parentRevisionId)}
                  </span>
                </p>
              )}
              <fieldset className="flex flex-wrap gap-1" aria-label="Version actions">
                {(['revisions', 'compare', 'merge', 'history', 'releases'] as const).map((item) => (
                  <Button
                    key={item}
                    size="xs"
                    variant={mode === item ? 'secondary' : 'ghost'}
                    aria-pressed={mode === item}
                    disabled={busy}
                    onClick={() => {
                      setMode(item);
                      invalidateReview();
                    }}
                  >
                    {
                      {
                        revisions: 'Revisions',
                        compare: 'Compare / restore',
                        merge: 'Merge',
                        history: 'Operations',
                        releases: 'Releases',
                      }[item]
                    }
                  </Button>
                ))}
              </fieldset>
              {mode === 'revisions' && (
                <>
                  <ol aria-label="Saved revisions" className="divide-y divide-border">
                    {[...selected.variant.revisions]
                      .sort((a, b) => b.number - a.number)
                      .map((revision) => {
                        const commit = commits.data?.items.find(
                          (item) => item.revisionId === revision.id,
                        );
                        return (
                          <li
                            key={revision.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                          >
                            <span className="min-w-0 break-words">
                              Revision {revision.number}
                              {revision.id === destinationHead ? ' · Head' : ''}
                              {revision.id === selected.variant.publishedHeadRevisionId
                                ? ' · Published package'
                                : ''}
                              {commit?.message && (
                                <span className="block text-muted-foreground">
                                  {commit.message}
                                </span>
                              )}
                              {commit?.mergeParentRevisionId && (
                                <span className="block text-muted-foreground">
                                  Merged from{' '}
                                  <span className="font-mono">
                                    {short(commit.mergeParentRevisionId)}
                                  </span>
                                </span>
                              )}
                            </span>
                            <Button
                              size="xs"
                              variant="ghost"
                              aria-pressed={selectedId === revision.id}
                              onClick={() => select(revision.id)}
                            >
                              Inspect revision {revision.number}
                            </Button>
                          </li>
                        );
                      })}
                  </ol>
                  {commits.isError && (
                    <p className="text-xs text-muted-foreground">
                      Commit messages and merge ancestry could not be loaded. Refresh to retry.
                    </p>
                  )}
                  {onOpenRevision && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={locked}
                      onClick={() => void onOpenRevision(selected.revision)}
                    >
                      Open exact revision
                    </Button>
                  )}
                </>
              )}
              {(mode === 'compare' || mode === 'merge') && (
                <>
                  <RevisionPicker
                    title={mode === 'merge' ? 'Source variant head' : 'Revision to compare'}
                    value={otherId}
                    disabled={busy}
                    items={revisions.filter(
                      (item) =>
                        mode !== 'merge' ||
                        (!item.variant.archivedAt &&
                          item.variant.variantId !== selected.variant.variantId &&
                          item.revision.id === item.variant.draftHeadRevisionId),
                    )}
                    onChange={(id) => {
                      setOtherId(id);
                      invalidateReview();
                    }}
                  />
                  {mode === 'compare' ? (
                    <>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={locked || !other || !capability.data?.diff}
                        onClick={() =>
                          void run(async () => {
                            setDiff(
                              await diffTemplateVersions(assetId, {
                                brandId,
                                fromRevisionId: selected.revision.id,
                                toRevisionId: otherId,
                              }),
                            );
                          })
                        }
                      >
                        Compare revisions
                      </Button>
                      {diff && <VersionDiff diff={diff} />}
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={
                          locked ||
                          !other ||
                          !editableBranch ||
                          otherId === destinationHead ||
                          !capability.data?.revert
                        }
                        onClick={() =>
                          void run(async () => {
                            const compared = await diffTemplateVersions(assetId, {
                              brandId,
                              fromRevisionId: destinationHead!,
                              toRevisionId: otherId,
                            });
                            setReview({
                              kind: 'restore',
                              revisionId: otherId,
                              headId: destinationHead!,
                              diff: compared,
                            });
                          })
                        }
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        Review restoration onto {label(selected.variant)}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Merge the source head into {label(selected.variant)}. Both parents are
                        retained in a new destination revision.
                      </p>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={
                          locked || !mergeInput || !editableBranch || !capability.data?.merge
                        }
                        onClick={() =>
                          void run(async () => {
                            setPreview(await previewTemplateMerge(assetId, mergeInput!));
                            setChoices({});
                          })
                        }
                      >
                        <GitMerge className="size-3" aria-hidden />
                        Preview merge
                      </Button>
                      {preview && (
                        <div className="space-y-2">
                          {!previewCurrent && (
                            <p role="alert" className="text-xs text-destructive">
                              A branch head changed. Preview the merge again.
                            </p>
                          )}
                          <p className="text-xs">
                            {preview.conflicts.length
                              ? 'Choose a value for every conflict.'
                              : 'Independent changes combine without conflicts.'}
                          </p>
                          {preview.conflicts.map((conflict) => (
                            <fieldset
                              key={conflict.path}
                              className="space-y-1 border-y border-border py-2 text-xs"
                            >
                              <legend className="break-all font-mono">
                                {conflict.path} · {conflict.kind}
                              </legend>
                              <p className="break-words">Base: {value(conflict.base)}</p>
                              <p className="break-words">
                                {label(selected.variant)}: {value(conflict.ours)}
                              </p>
                              <p className="break-words">
                                {other ? label(other.variant) : 'Source'}: {value(conflict.theirs)}
                              </p>
                              {(['ours', 'theirs'] as const).map((choice) => (
                                <Button
                                  key={choice}
                                  size="xs"
                                  variant={
                                    choices[conflict.path] === choice ? 'secondary' : 'outline'
                                  }
                                  disabled={locked || !previewCurrent}
                                  aria-pressed={choices[conflict.path] === choice}
                                  onClick={() =>
                                    setChoices((current) => ({
                                      ...current,
                                      [conflict.path]: choice,
                                    }))
                                  }
                                >
                                  {choice === 'ours'
                                    ? `Keep ${label(selected.variant)}`
                                    : `Take ${other ? label(other.variant) : 'source'}`}
                                </Button>
                              ))}
                            </fieldset>
                          ))}
                          <Button
                            size="xs"
                            disabled={
                              locked ||
                              !previewCurrent ||
                              preview.conflicts.some((conflict) => !choices[conflict.path])
                            }
                            onClick={() =>
                              void run(() =>
                                mutate('merge', {
                                  ...mergeInput!,
                                  previewToken: preview.previewToken,
                                  resolutions: preview.conflicts.map((conflict) => ({
                                    path: conflict.path,
                                    choice: choices[conflict.path],
                                  })),
                                }),
                              )
                            }
                          >
                            Commit reviewed merge
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {mode === 'history' && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Order is recorded within each working copy. Timestamps do not establish order
                    between clients. First 100 events, grouped by working copy.
                  </p>
                  {history.isError ? (
                    <Button size="xs" variant="outline" onClick={() => void history.refetch()}>
                      Retry operation history
                    </Button>
                  ) : history.isPending ? (
                    <p role="status">Reading operations…</p>
                  ) : (
                    <ol
                      aria-label="Permanent operation history"
                      className="max-h-80 overflow-auto divide-y divide-border"
                    >
                      {history.data?.items.map((event) => (
                        <li key={event.id} className="space-y-1 py-2 text-xs">
                          <p>
                            <History className="me-1 inline size-3" aria-hidden />
                            <span className="font-mono">
                              {short(event.workingCopyId)} #{event.sequence} · {event.command}
                            </span>{' '}
                            · {event.outcome} · {event.evidence}
                          </p>
                          <p className="break-words text-muted-foreground">
                            Principal {event.principalId} · {event.channel}
                            {event.origin?.button ? ` · ${event.origin.button}` : ''}
                            {event.origin?.shortcut ? ` · ${event.origin.shortcut}` : ''}
                          </p>
                          <details>
                            <summary>Recorded input and causal links</summary>
                            <pre className="overflow-auto text-2xs">
                              {JSON.stringify(
                                {
                                  changes: event.changes,
                                  causedBy: event.causedBy,
                                  origin: event.origin,
                                  revisionIds: event.revisionIds,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </li>
                      ))}
                      {!history.data?.items.length && (
                        <li>No operations recorded for this family.</li>
                      )}
                    </ol>
                  )}
                </>
              )}
              {mode === 'releases' && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Production is selected per render binding. A published package alone does not
                    move a coordinated release.
                  </p>
                  {releases.isError ? (
                    <Button size="xs" variant="outline" onClick={() => void releases.refetch()}>
                      Retry releases
                    </Button>
                  ) : releases.isPending ? (
                    <p role="status">Reading releases…</p>
                  ) : (
                    <>
                      {releaseTargets.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Publish a verified package to establish a render binding before releasing.
                        </p>
                      )}
                      <ul aria-label="Production bindings" className="divide-y divide-border">
                        {releaseTargets.map((target) => {
                          const head = headFor(target.bindingId, target.templateKey);
                          const release = releases.data?.items.find((item) => item.id === head);
                          return (
                            <li
                              key={`${target.bindingId}:${target.templateKey}`}
                              className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                            >
                              <span className="break-all">
                                {target.templateKey} · binding {short(target.bindingId)}
                                <span className="block text-muted-foreground">
                                  {head
                                    ? `Production release ${short(head)} · revision ${release ? short(release.revisionId) : 'outside loaded history'}`
                                    : 'No coordinated production release'}
                                </span>
                              </span>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={
                                  locked ||
                                  !capability.data?.release ||
                                  !!selected.variant.archivedAt ||
                                  release?.revisionId === selected.revision.id
                                }
                                onClick={() =>
                                  setReview({
                                    kind: 'release',
                                    revisionId: selected.revision.id,
                                    bindingId: target.bindingId,
                                    templateKey: target.templateKey,
                                    expectedReleaseId: head,
                                  })
                                }
                              >
                                Review release
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                      <ol aria-label="Immutable releases" className="divide-y divide-border">
                        {releases.data?.items.map((release) => (
                          <li key={release.id} className="space-y-1 py-2 text-xs">
                            <span className="break-all">
                              Release {short(release.id)} · revision {short(release.revisionId)} ·{' '}
                              {release.templateKey}
                            </span>
                            {release.id === headFor(release.bindingId, release.templateKey) ? (
                              <Pill>Production</Pill>
                            ) : (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={locked || !capability.data?.release}
                                onClick={() =>
                                  setReview({
                                    kind: 'rollback',
                                    releaseId: release.id,
                                    revisionId: release.revisionId,
                                    bindingId: release.bindingId,
                                    templateKey: release.templateKey,
                                    expectedReleaseId: headFor(
                                      release.bindingId,
                                      release.templateKey,
                                    ),
                                  })
                                }
                              >
                                Review rollback
                              </Button>
                            )}
                            <details>
                              <summary>Verified release pins</summary>
                              <pre className="overflow-auto text-2xs">
                                {JSON.stringify(release.manifest, null, 2)}
                              </pre>
                            </details>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </>
              )}
              {review && (
                <section
                  aria-label="Review versioning change"
                  className="space-y-2 border-y border-border py-3"
                >
                  <p className="text-xs">
                    {review.kind === 'restore'
                      ? `Append the reviewed restoration to ${label(selected.variant)}. Intervening revisions remain in history.`
                      : `${review.kind === 'rollback' ? 'Roll production back' : 'Promote production'} to revision ${short(review.revisionId)} for ${review.templateKey} · binding ${short(review.bindingId)}.`}
                  </p>
                  {review.kind === 'restore' ? (
                    <VersionDiff diff={review.diff} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Expected current release:{' '}
                      {review.expectedReleaseId ? short(review.expectedReleaseId) : 'none'}. The
                      server rechecks this before changing production.
                    </p>
                  )}
                  <Button
                    size="xs"
                    disabled={
                      locked ||
                      (review.kind === 'restore'
                        ? review.headId !== destinationHead
                        : review.expectedReleaseId !==
                          headFor(review.bindingId, review.templateKey))
                    }
                    onClick={() =>
                      void run(() =>
                        review.kind === 'restore'
                          ? mutate('restore', {
                              variantId: selected.variant.variantId,
                              restoreRevisionId: review.revisionId,
                              expectedHeadRevisionId: review.headId,
                            })
                          : mutate(review.kind, {
                              bindingId: review.bindingId,
                              templateKey: review.templateKey,
                              expectedReleaseId: review.expectedReleaseId,
                              ...(review.kind === 'release'
                                ? { revisionId: review.revisionId }
                                : { releaseId: review.releaseId }),
                            }),
                      )
                    }
                  >
                    {review.kind === 'restore'
                      ? 'Append restored revision'
                      : review.kind === 'rollback'
                        ? 'Confirm release rollback'
                        : 'Confirm production release'}
                  </Button>{' '}
                  <Button size="xs" variant="ghost" disabled={busy} onClick={() => setReview(null)}>
                    Cancel review
                  </Button>
                </section>
              )}
              <form
                className="flex flex-wrap items-start gap-2 border-t border-border pt-3"
                onSubmit={form.handleSubmit(
                  ({ name }) =>
                    void run(async () => {
                      await mutate('branch', { parentRevisionId: selected.revision.id, name });
                      form.reset();
                    }),
                )}
              >
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label="New variant name"
                    placeholder="New variant name"
                    maxLength={120}
                    disabled={locked}
                    {...form.register('name')}
                  />
                  {form.formState.errors.name && (
                    <p role="alert" className="text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <Button size="sm" type="submit" disabled={locked || !capability.data?.branch}>
                  Branch from revision {selected.revision.number}
                </Button>
              </form>
              {capability.isError && (
                <p className="text-xs text-muted-foreground">
                  Version actions are unavailable until format capabilities can be read.{' '}
                  <Button size="xs" variant="ghost" onClick={() => void capability.refetch()}>
                    Retry capabilities
                  </Button>
                </p>
              )}
              {capability.data &&
                Object.values(capability.data.reasons).map((reason) => (
                  <p key={reason} className="text-xs text-muted-foreground">
                    {reason}
                  </p>
                ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function RevisionPicker({
  title,
  value,
  items,
  onChange,
  disabled,
}: {
  title: string;
  value: string;
  items: { variant: TemplateRevisionVariant; revision: TemplateRevision }[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const selected = items.find((item) => item.revision.id === value);
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(id) => {
        if (id) onChange(id);
      }}
    >
      <SelectTrigger aria-label={title}>
        <SelectValue placeholder={title}>
          {selected ? `${label(selected.variant)} · Revision ${selected.revision.number}` : title}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.revision.id} value={item.revision.id}>
            {label(item.variant)} · Revision {item.revision.number}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function VersionDiff({ diff }: { diff: TemplateVersionDiffResponse }) {
  return (
    <div className="space-y-2 text-xs">
      {(diff.sourceChanged || diff.nativeChanged) && (
        <p>
          Source package or native scene changed. Review its artifact pins before restoring or
          releasing.
        </p>
      )}
      <ul aria-label="Semantic revision differences" className="divide-y divide-border">
        {diff.changes.map((change) => (
          <li key={change.path} className="space-y-1 py-2">
            <p className="break-all font-mono">{change.path}</p>
            <p className="break-words">Before: {value(change.from)}</p>
            <p className="break-words">After: {value(change.to)}</p>
          </li>
        ))}
      </ul>
      {!diff.changes.length && (
        <p>
          No semantic property differences
          {diff.sourceChanged || diff.nativeChanged ? '; package identity differs' : ''}.
        </p>
      )}
    </div>
  );
}

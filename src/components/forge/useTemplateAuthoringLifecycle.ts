'use client';

import type {
  TemplateAuthoringArtifact,
  TemplateAuthoringArtifactCommit,
  TemplateAuthoringDraft,
  TemplateAuthoringDocument,
  TemplateAuthoringNativeRender,
  TemplateAuthoringNativeRenderRequest,
  TemplateAuthoringPreparation,
  TemplateAuthoringScope,
  TemplatePreview,
} from '@continuum/contracts';
import { outputFormatsOfParse } from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  commitTemplateAuthoringArtifact,
  compileTemplateAuthoring,
  fetchTemplateAuthoringArtifact,
  fetchTemplateAuthoringNativeRender,
  fetchTemplateAuthoringPreparation,
  prepareTemplateAuthoringArtifact,
  requestTemplateAuthoringNativeRender,
  reviewTemplateAuthoringArtifact,
} from '@/lib/library/templateSources';
import type { LayerDraftSyncStatus } from './layerDraft';

type AuthoringLifecycleState = 'idle' | 'waiting' | 'compiling' | 'preparing' | 'rendering' | 'needs-input' | 'ready' | 'failed';

type UseTemplateAuthoringLifecycleArgs = {
  active: boolean;
  enabled: boolean;
  scope: TemplateAuthoringScope | null;
  revision: number;
  syncStatus: LayerDraftSyncStatus;
  draftDirty: boolean;
  persistedDraft: TemplateAuthoringDraft | null;
  sourceDocument: TemplateAuthoringDocument | null;
  parse: TemplatePreview | null | undefined;
};

type TemplateAuthoringLifecycle = {
  state: AuthoringLifecycleState;
  artifact: TemplateAuthoringArtifact | null;
  preparation: TemplateAuthoringPreparation | null;
  renders: TemplateAuthoringNativeRender[];
  error: string | null;
  isCurrent: boolean;
  canReview: boolean;
  canPublish: boolean;
  retry: () => Promise<void>;
  review: () => Promise<boolean>;
  commit: (request: Omit<TemplateAuthoringArtifactCommit, 'artifactId' | 'expectedDraftRevision' | 'sourceChecksum' | 'commandDigest' | 'packageChecksum'>) => Promise<TemplateAuthoringArtifact | null>;
  reviewAndCommit: (request: Omit<TemplateAuthoringArtifactCommit, 'artifactId' | 'expectedDraftRevision' | 'sourceChecksum' | 'commandDigest' | 'packageChecksum'>) => Promise<TemplateAuthoringArtifact | null>;
};

type PublishTarget = {
  generation: number;
  key: string;
  revision: number;
  artifactId: string;
  sourceChecksum: string;
  commandDigest: string;
  packageChecksum: string;
  eligible: boolean;
};

type PublishAttempt = { signature: string; promise: Promise<TemplateAuthoringArtifact | null> };

const sameHash = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function sameScope(left: TemplateAuthoringScope, right: TemplateAuthoringScope) {
  return left.brandId === right.brandId && left.assetId === right.assetId && left.baseVersionId === right.baseVersionId;
}

function assertArtifactPins(
  artifact: TemplateAuthoringArtifact,
  scope: TemplateAuthoringScope,
  revision: number,
  sourceChecksum: string,
) {
  if (
    !sameScope(artifact.scope, scope) ||
    artifact.draftRevision !== revision ||
    !sameHash(artifact.sourceChecksum, sourceChecksum)
  ) throw new Error('The prepared package did not match this private draft revision.');
}

function assertPreparationPins(
  preparation: TemplateAuthoringPreparation,
  artifact: TemplateAuthoringArtifact,
) {
  if (
    preparation.artifactId !== artifact.artifactId ||
    !sameScope(preparation.scope, artifact.scope) ||
    preparation.draftRevision !== artifact.draftRevision ||
    !sameHash(preparation.sourceChecksum, artifact.sourceChecksum) ||
    !sameHash(preparation.commandDigest, artifact.commandDigest) ||
    !sameHash(preparation.packageChecksum, artifact.packageChecksum)
  ) throw new Error('Preparation returned a package for a different draft revision.');
}

function nativeRequestsFor(
  artifact: TemplateAuthoringArtifact,
  sourceDocument: TemplateAuthoringDocument | null,
  parse: TemplatePreview | null | undefined,
): TemplateAuthoringNativeRenderRequest[] {
  if (!sourceDocument) return [];
  const compositions = new Map(sourceDocument.compositions.map((composition) => [composition.name, composition]));
  const pairs = outputFormatsOfParse(parse).flatMap((format) => {
    const composition = compositions.get(format.id);
    if (
      !composition || composition.compId === null ||
      typeof composition.durationSec !== 'number' || !Number.isFinite(composition.durationSec) ||
      typeof composition.frameRate !== 'number' || !Number.isFinite(composition.frameRate) || composition.frameRate <= 0
    ) return [];
    const frameCount = Math.ceil(composition.durationSec * composition.frameRate - 1e-9);
    if (frameCount < 1) return [];
    const frameIndices = [...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1])].sort((a, b) => a - b);
    return [{ compId: composition.compId, formatId: format.id, frameIndices }];
  });
  if (!pairs.length) return [];

  const chunks: Array<Array<{ compId: number; formatId: string; frameIndices: number[] }>> = [];
  let current = new Map<string, { compId: number; formatId: string; frameIndices: number[] }>();
  let count = 0;
  const flush = () => {
    if (!current.size) return;
    chunks.push([...current.values()]);
    current = new Map();
    count = 0;
  };
  for (const pair of pairs) {
    for (const frameIndex of pair.frameIndices) {
      const key = `${pair.compId}:${pair.formatId}`;
      let entry = current.get(key);
      if ((!entry && current.size >= 8) || count >= 16) {
        flush();
        entry = undefined;
      }
      if (!entry) {
        entry = { compId: pair.compId, formatId: pair.formatId, frameIndices: [] };
        current.set(key, entry);
      }
      entry.frameIndices.push(frameIndex);
      count += 1;
    }
  }
  flush();
  return chunks.map((frames) => ({
    expectedDraftRevision: artifact.draftRevision,
    sourceChecksum: artifact.sourceChecksum,
    commandDigest: artifact.commandDigest,
    packageChecksum: artifact.packageChecksum,
    frames,
  }));
}

export function useTemplateAuthoringLifecycle({
  active,
  enabled,
  scope,
  revision,
  syncStatus,
  draftDirty,
  persistedDraft,
  sourceDocument,
  parse,
}: UseTemplateAuthoringLifecycleArgs): TemplateAuthoringLifecycle {
  const [state, setState] = useState<AuthoringLifecycleState>('idle');
  const [artifact, setArtifact] = useState<TemplateAuthoringArtifact | null>(null);
  const [preparation, setPreparation] = useState<TemplateAuthoringPreparation | null>(null);
  const [renders, setRenders] = useState<TemplateAuthoringNativeRender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const runRef = useRef<() => Promise<void>>(async () => {});
  const attemptedKey = useRef<string | null>(null);
  const generation = useRef(0);
  const publishTarget = useRef<PublishTarget | null>(null);
  const publishAttempt = useRef<PublishAttempt | null>(null);

  const sourceChecksum = persistedDraft?.sourceChecksum ?? sourceDocument?.sourceChecksum ?? null;
  const key = useMemo(
    () => scope && sourceChecksum ? `${scope.brandId}:${scope.assetId}:${scope.baseVersionId}:${revision}:${sourceChecksum}` : '',
    [scope, revision, sourceChecksum],
  );
  const draftIsCurrent = !!scope && !!persistedDraft && persistedDraft.revision === revision &&
    sameScope(persistedDraft.scope, scope) && !persistedDraft.requiresReconciliation &&
    !!sourceChecksum && sameHash(persistedDraft.sourceChecksum, sourceChecksum);
  const eligible = active && enabled && !!scope && !!sourceChecksum && revision > 0 &&
    syncStatus === 'saved' && !draftDirty && draftIsCurrent && persistedDraft!.commands.length > 0;

  useEffect(() => {
    generation.current += 1;
    attemptedKey.current = null;
    setState(eligible ? 'waiting' : 'idle');
    setArtifact(null);
    setPreparation(null);
    setRenders([]);
    setError(null);
  }, [key]);

  const currentArtifact = artifact && scope && sourceChecksum &&
    artifact.draftRevision === revision && sameScope(artifact.scope, scope) &&
    sameHash(artifact.sourceChecksum, sourceChecksum) && artifact.state !== 'invalidated'
    ? artifact
    : null;
  const currentPreparation = preparation && currentArtifact &&
    preparation.artifactId === currentArtifact.artifactId &&
    preparation.draftRevision === currentArtifact.draftRevision &&
    sameHash(preparation.sourceChecksum, currentArtifact.sourceChecksum) &&
    sameHash(preparation.commandDigest, currentArtifact.commandDigest) &&
    sameHash(preparation.packageChecksum, currentArtifact.packageChecksum)
    ? preparation
    : null;
  const currentRenders = useMemo(() => currentArtifact ? renders.filter((render) =>
    render.artifactId === currentArtifact.artifactId &&
    render.draftRevision === currentArtifact.draftRevision &&
    sameHash(render.sourceChecksum, currentArtifact.sourceChecksum) &&
    sameHash(render.commandDigest, currentArtifact.commandDigest) &&
    sameHash(render.packageChecksum, currentArtifact.packageChecksum),
  ) : [], [currentArtifact, renders]);
  const isCurrent = !!currentArtifact && eligible;
  const verificationPassed = !!currentArtifact &&
    Object.values(currentArtifact.verification).every((value) => value === 'passed') &&
    currentArtifact.verification.nativeAfterEffects === 'passed';
  const nativeEvidencePassed = currentRenders.length > 0 &&
    currentRenders.every((render) => render.state === 'completed' && render.frames.length > 0 && render.frames.every((frame) => !frame.stale));
  const canReview = eligible && !!currentArtifact && currentArtifact.state === 'prepared' &&
    verificationPassed && currentPreparation?.state === 'review_ready' && nativeEvidencePassed;
  const canPublish = canReview || (eligible && !!currentArtifact && currentArtifact.state === 'reviewed' &&
    verificationPassed && currentPreparation?.state === 'review_ready' && nativeEvidencePassed);
  publishTarget.current = currentArtifact && scope ? {
    generation: generation.current,
    key,
    revision,
    artifactId: currentArtifact.artifactId,
    sourceChecksum: currentArtifact.sourceChecksum,
    commandDigest: currentArtifact.commandDigest,
    packageChecksum: currentArtifact.packageChecksum,
    eligible,
  } : null;

  const run = useCallback(async () => {
    if (!eligible || !scope || !persistedDraft || !sourceChecksum || !key) return;
    const runGeneration = generation.current;
    const isLive = () => runGeneration === generation.current;
    setError(null);
    try {
      let nextArtifact = currentArtifact;
      if (!nextArtifact) {
        setState('compiling');
        nextArtifact = await compileTemplateAuthoring(scope.assetId, {
          brandId: scope.brandId,
          baseVersionId: scope.baseVersionId,
          expectedRevision: persistedDraft.revision,
        });
        if (!isLive()) return;
        assertArtifactPins(nextArtifact, scope, revision, sourceChecksum);
        setArtifact(nextArtifact);
      }

      setState('preparing');
      const nextPreparation = await prepareTemplateAuthoringArtifact(scope.assetId, nextArtifact.artifactId, scope, {
        artifactId: nextArtifact.artifactId,
        expectedDraftRevision: nextArtifact.draftRevision,
        sourceChecksum: nextArtifact.sourceChecksum,
        commandDigest: nextArtifact.commandDigest,
        packageChecksum: nextArtifact.packageChecksum,
      });
      if (!isLive()) return;
      assertPreparationPins(nextPreparation, nextArtifact);
      setPreparation(nextPreparation);

      if (nextPreparation.state !== 'review_ready') {
        setState(nextPreparation.state === 'needs_input' || nextPreparation.state === 'failed' || nextPreparation.state === 'stale'
          ? 'needs-input'
          : 'preparing');
        return;
      }

      const requests = nativeRequestsFor(nextArtifact, sourceDocument, parse);
      if (!requests.length) {
        setState('ready');
        return;
      }
      setState('rendering');
      const started: TemplateAuthoringNativeRender[] = [];
      for (const request of requests) {
        const render = await requestTemplateAuthoringNativeRender(scope.assetId, nextArtifact.artifactId, scope, request);
        if (!isLive()) return;
        if (render.artifactId !== nextArtifact.artifactId || render.draftRevision !== nextArtifact.draftRevision ||
            !sameHash(render.sourceChecksum, nextArtifact.sourceChecksum) ||
            !sameHash(render.commandDigest, nextArtifact.commandDigest) ||
            !sameHash(render.packageChecksum, nextArtifact.packageChecksum))
          throw new Error('Native sample render returned evidence for a different private package.');
        started.push(render);
        setRenders((current) => [...current.filter((item) => item.requestDigest !== render.requestDigest), render]);
      }
      if (started.some((render) => render.state === 'needs_input')) setState('needs-input');
      else if (started.every((render) => render.state === 'completed')) {
        setArtifact(await fetchTemplateAuthoringArtifact(scope.assetId, nextArtifact.artifactId, scope));
        setState('ready');
      } else setState('rendering');
    } catch (reason) {
      if (!isLive()) return;
      setError(reason instanceof Error ? reason.message : 'Private package preparation failed.');
      setState('failed');
    }
  }, [eligible, scope, persistedDraft, sourceChecksum, key, revision, currentArtifact, sourceDocument, parse]);
  runRef.current = run;

  useEffect(() => {
    if (!eligible || !key || attemptedKey.current === `${key}:${retryTick}`) return;
    const timer = window.setTimeout(() => {
      attemptedKey.current = `${key}:${retryTick}`;
      void runRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [eligible, key, retryTick]);

  useEffect(() => {
    if (!scope || !currentArtifact || !currentPreparation || !isCurrent) return;
    const shouldPollPreparation = ['pending', 'submitted', 'running'].includes(currentPreparation.state);
    const shouldPollRenders = currentRenders.some((render) => ['submitted', 'running'].includes(render.state));
    const shouldPollArtifact = currentArtifact.state === 'pending' || shouldPollPreparation ||
      (currentArtifact.state === 'prepared' && currentArtifact.commit !== null);
    if (!shouldPollPreparation && !shouldPollRenders && !shouldPollArtifact) return;
    const timer = window.setTimeout(() => {
      const runGeneration = generation.current;
      void Promise.all([
        shouldPollArtifact
          ? fetchTemplateAuthoringArtifact(scope.assetId, currentArtifact.artifactId, scope).then((value) => {
              if (runGeneration === generation.current && value.artifactId === currentArtifact.artifactId &&
                  value.draftRevision === currentArtifact.draftRevision &&
                  sameHash(value.sourceChecksum, currentArtifact.sourceChecksum) &&
                  sameHash(value.commandDigest, currentArtifact.commandDigest) &&
                  sameHash(value.packageChecksum, currentArtifact.packageChecksum))
                setArtifact(value);
            })
          : Promise.resolve(),
        shouldPollPreparation
          ? fetchTemplateAuthoringPreparation(scope.assetId, currentArtifact.artifactId, scope).then((value) => {
              if (runGeneration === generation.current) setPreparation(value);
            })
          : Promise.resolve(),
        ...currentRenders.filter((render) => ['submitted', 'running'].includes(render.state)).map((render) =>
          fetchTemplateAuthoringNativeRender(scope.assetId, currentArtifact.artifactId, render.renderId, scope).then((value) => {
            if (runGeneration === generation.current) {
              setRenders((current) => current.map((item) => item.renderId === value.renderId ? value : item));
              if (value.state === 'completed' && value.frames.length) {
                void fetchTemplateAuthoringArtifact(scope.assetId, currentArtifact.artifactId, scope)
                  .then((next) => { if (runGeneration === generation.current) setArtifact(next); });
              }
            }
          }),
        ),
      ]).catch((reason: unknown) => {
        if (runGeneration === generation.current)
          setError(reason instanceof Error ? reason.message : 'Could not refresh private preparation status.');
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [scope, currentArtifact, currentPreparation, currentRenders, isCurrent]);

  useEffect(() => {
    if (!currentArtifact || !currentPreparation || !currentRenders.length) return;
    if (currentRenders.some((render) => render.state === 'needs_input')) setState('needs-input');
    else if (currentRenders.every((render) => render.state === 'completed')) setState('ready');
    else if (currentRenders.some((render) => ['submitted', 'running'].includes(render.state))) setState('rendering');
  }, [currentArtifact, currentPreparation, currentRenders]);

  const retry = useCallback(async () => {
    setError(null);
    if (currentArtifact && currentPreparation && scope) {
      setState('rendering');
      await run();
      return;
    }
    attemptedKey.current = null;
    setRetryTick((value) => value + 1);
  }, [currentArtifact, currentPreparation, scope, run]);

  const review = useCallback(async () => {
    if (!canReview || !currentArtifact || !scope) return false;
    try {
      const reviewed = await reviewTemplateAuthoringArtifact(scope.assetId, currentArtifact.artifactId, scope, {
        artifactId: currentArtifact.artifactId,
        expectedDraftRevision: currentArtifact.draftRevision,
        sourceChecksum: currentArtifact.sourceChecksum,
        commandDigest: currentArtifact.commandDigest,
        packageChecksum: currentArtifact.packageChecksum,
      });
      assertArtifactPins(reviewed, scope, revision, currentArtifact.sourceChecksum);
      setArtifact(reviewed);
      return reviewed.state === 'reviewed';
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not review this private package.');
      return false;
    }
  }, [canReview, currentArtifact, scope, revision]);

  const commit = useCallback(async (
    request: Omit<TemplateAuthoringArtifactCommit, 'artifactId' | 'expectedDraftRevision' | 'sourceChecksum' | 'commandDigest' | 'packageChecksum'>,
  ) => {
    if (!currentArtifact || currentArtifact.state !== 'reviewed' || !scope) return null;
    const committed = await commitTemplateAuthoringArtifact(scope.assetId, currentArtifact.artifactId, scope, {
      artifactId: currentArtifact.artifactId,
      expectedDraftRevision: currentArtifact.draftRevision,
      sourceChecksum: currentArtifact.sourceChecksum,
      commandDigest: currentArtifact.commandDigest,
      packageChecksum: currentArtifact.packageChecksum,
      ...request,
    });
    assertArtifactPins(committed, scope, revision, currentArtifact.sourceChecksum);
    setArtifact(committed);
    return committed;
  }, [currentArtifact, scope, revision]);

  const reviewAndCommit = useCallback((
    request: Omit<TemplateAuthoringArtifactCommit, 'artifactId' | 'expectedDraftRevision' | 'sourceChecksum' | 'commandDigest' | 'packageChecksum'>,
  ): Promise<TemplateAuthoringArtifact | null> => {
    if (!canPublish || !currentArtifact || !scope) return Promise.resolve(null);
    const target: PublishTarget = {
      generation: generation.current,
      key,
      revision,
      artifactId: currentArtifact.artifactId,
      sourceChecksum: currentArtifact.sourceChecksum,
      commandDigest: currentArtifact.commandDigest,
      packageChecksum: currentArtifact.packageChecksum,
      eligible,
    };
    const signature = JSON.stringify([target.key, target.artifactId, target.revision, target.sourceChecksum,
      target.commandDigest, target.packageChecksum, request]);
    if (publishAttempt.current)
      return publishAttempt.current.signature === signature
        ? publishAttempt.current.promise
        : Promise.resolve(null);

    const sameTargetIsCurrent = () => {
      const latest = publishTarget.current;
      return generation.current === target.generation && !!latest && latest.eligible &&
        latest.generation === target.generation && latest.key === target.key &&
        latest.revision === target.revision && latest.artifactId === target.artifactId &&
        sameHash(latest.sourceChecksum, target.sourceChecksum) &&
        sameHash(latest.commandDigest, target.commandDigest) &&
        sameHash(latest.packageChecksum, target.packageChecksum);
    };
    const pins = {
      artifactId: target.artifactId,
      expectedDraftRevision: target.revision,
      sourceChecksum: target.sourceChecksum,
      commandDigest: target.commandDigest,
      packageChecksum: target.packageChecksum,
    };
    const attempt = (async () => {
      try {
        if (!sameTargetIsCurrent()) return null;
        const reviewed = currentArtifact.state === 'reviewed'
          ? currentArtifact
          : await reviewTemplateAuthoringArtifact(scope.assetId, target.artifactId, scope, pins);
        assertArtifactPins(reviewed, scope, target.revision, target.sourceChecksum);
        if (reviewed.artifactId !== target.artifactId ||
            !sameHash(reviewed.commandDigest, target.commandDigest) ||
            !sameHash(reviewed.packageChecksum, target.packageChecksum) ||
            reviewed.state !== 'reviewed' ||
            !Object.values(reviewed.verification).every((value) => value === 'passed') ||
            reviewed.verification.nativeAfterEffects !== 'passed')
          throw new Error('Review did not return the exact verified package.');
        if (!sameTargetIsCurrent()) return null;
        setArtifact(reviewed);

        const committed = await commitTemplateAuthoringArtifact(scope.assetId, target.artifactId, scope, {
          ...pins,
          ...request,
        });
        assertArtifactPins(committed, scope, target.revision, target.sourceChecksum);
        if (committed.artifactId !== target.artifactId ||
            !sameHash(committed.commandDigest, target.commandDigest) ||
            !sameHash(committed.packageChecksum, target.packageChecksum))
          throw new Error('Version publication returned a different private package.');
        if (committed.state !== 'committed' || !committed.commit ||
            !sameHash(committed.commit.packageChecksum, target.packageChecksum))
          throw new Error('The exact reviewed package was not confirmed as published.');
        // Once the exact server-side CAS succeeds, later edits belong to the next
        // draft revision and must not hide confirmation for this published package.
        if (sameTargetIsCurrent()) setArtifact(committed);
        return committed;
      } catch (reason) {
        if (sameTargetIsCurrent())
          setError(reason instanceof Error ? reason.message : 'Could not publish this private package.');
        return null;
      }
    })();
    const promise = attempt.finally(() => {
      if (publishAttempt.current?.signature === signature) publishAttempt.current = null;
    });
    publishAttempt.current = { signature, promise };
    return promise;
  }, [canPublish, currentArtifact, scope, key, revision, eligible]);

  return {
    state: eligible ? state : 'idle',
    artifact: eligible ? currentArtifact : null,
    preparation: eligible ? currentPreparation : null,
    renders: eligible ? currentRenders : [],
    error,
    isCurrent,
    canReview,
    canPublish,
    retry,
    review,
    commit,
    reviewAndCommit,
  };
}

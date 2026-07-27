'use client';

import { Check, CircleDashed, Link2, Target } from 'lucide-react';
import type { GoalArtifactView, GoalWorkspaceView } from '@/lib/goals/models';
import { orderArtifactsForManifest } from '@/lib/goals/models';
import { cn } from '@/lib/utils';
import { GoalStatusPill } from './GoalStatusPill';

type GoalArtifactManifestProps = {
  goal: GoalWorkspaceView;
  selectedArtifactId: string | null;
  onSelectArtifact: (artifactId: string) => void;
};

function dependencyLabel(
  artifact: GoalArtifactView,
  artifactsById: ReadonlyMap<string, GoalArtifactView>,
): string | null {
  const labels = artifact.dependsOnArtifactIds
    .map((id) => artifactsById.get(id)?.title)
    .filter((title): title is string => Boolean(title));
  return labels.length > 0 ? `Depends on ${labels.join(', ')}` : null;
}

export function GoalArtifactManifest({
  goal,
  selectedArtifactId,
  onSelectArtifact,
}: GoalArtifactManifestProps) {
  const orderedArtifacts = orderArtifactsForManifest(goal.artifacts);
  const artifactsById = new Map(goal.artifacts.map((artifact) => [artifact.id, artifact]));

  return (
    <section className="flex min-h-0 flex-1 flex-col border-r border-border/70 bg-background/35">
      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wide text-muted-foreground">
          <Target className="size-3.5 text-primary" />
          Case objective
        </div>
        <p className="mt-2 text-sm font-medium leading-5 text-foreground">{goal.outcome}</p>
        {goal.doneWhen.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {goal.doneWhen.map((criterion) => (
              <li key={criterion} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="border-b border-border/70 px-3 py-2">
        <p className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
          Artifact dependency spine
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {orderedArtifacts.length === 0 ? (
          <div className="p-4">
            <p className="text-sm font-medium">No artifacts attached</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ask Jaina to attach the first evidence or deliverable to establish the work sequence.
            </p>
          </div>
        ) : (
          <ol className="relative py-1 before:absolute before:inset-y-4 before:left-[1.15rem] before:w-px before:bg-border">
            {orderedArtifacts.map((artifact, index) => {
              const selected = artifact.id === selectedArtifactId;
              const dependency = dependencyLabel(artifact, artifactsById);
              const resolved = artifact.status === 'accepted' || artifact.status === 'waived';
              const checklistItems = artifact.checklistItems ?? [];
              const resolvedChecklistItems = checklistItems.filter(
                (item) => item.status === 'resolved',
              ).length;

              return (
                <li key={artifact.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelectArtifact(artifact.id)}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'group flex w-full items-start gap-3 border-l-2 border-transparent px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      selected
                        ? 'border-l-primary bg-primary/5'
                        : 'hover:border-l-border hover:bg-muted/35',
                    )}
                  >
                    <span
                      className={cn(
                        'relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border bg-background',
                        resolved
                          ? 'border-primary text-primary'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {resolved ? (
                        <Check className="size-2.5" />
                      ) : (
                        <CircleDashed className="size-2.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span>
                          <span className="block font-mono text-3xs uppercase tracking-wide text-muted-foreground">
                            Evidence {String(index + 1).padStart(2, '0')} · {artifact.kindLabel}
                          </span>
                          <span className="mt-0.5 block text-sm font-medium text-foreground">
                            {artifact.title}
                          </span>
                        </span>
                        <GoalStatusPill status={artifact.status} />
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
                        <span className="font-mono">{artifact.versionLabel}</span>
                        {checklistItems.length > 0 ? (
                          <span>
                            {resolvedChecklistItems}/{checklistItems.length} checks grounded
                          </span>
                        ) : null}
                        {artifact.alignmentLabel ? <span>{artifact.alignmentLabel}</span> : null}
                      </span>
                      {dependency ? (
                        <span className="mt-1.5 flex items-start gap-1 text-2xs leading-4 text-muted-foreground">
                          <Link2 className="mt-0.5 size-3 shrink-0" />
                          {dependency}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

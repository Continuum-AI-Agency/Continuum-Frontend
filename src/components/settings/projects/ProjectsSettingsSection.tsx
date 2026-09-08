'use client';

// Settings → Projects: the create-and-manage surface for the sub-brand context scope.
//
// Deliberately NOT a rollup dashboard — no pipeline counts, no asset counts, no document
// list. Those need reads across five schemas and belong to the wave that adds them; this is
// the surface that has to exist first, because until a project can be created nothing else in
// the feature is reachable by a human.

import type { Project } from '@continuum/contracts';
import { Archive, ArchiveRestore, ChevronLeft, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { ProjectChip } from '@/components/projects';
import { Button } from '@/components/ui/button';
import { useCurrentUserAvatar } from '@/hooks/useCurrentUserAvatar';
import { useProjectMutations, useProjects } from '@/lib/projects/hooks';
import { ProjectForm } from './ProjectForm';

type Screen = { kind: 'list' } | { kind: 'form'; project: Project | null };

export function ProjectsSettingsSection({ brandId }: { brandId: string }) {
  // Reusing the existing session hook rather than adding a second way to ask who is signed
  // in. Only `user.id` is read here; the avatar work it also does is already paid for
  // elsewhere on this page.
  const { user } = useCurrentUserAvatar();
  // 'all', not 'active': archiving is a soft delete, and a settings surface that hides what it
  // archived leaves the user with no way to see or undo it.
  const { projects, isLoading, isError } = useProjects(brandId, 'all');
  const { archive, update } = useProjectMutations(brandId);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeProjects = projects.filter((project) => project.status === 'active');
  const archived = projects.filter((project) => project.status === 'archived');
  // The owner's stated goal was "teams within brands can be more organized", and a list with
  // no person on it organizes nothing. This is ORGANIZATION, not access control: everyone on
  // the brand still sees every project — the brand is the permission boundary, and a nested
  // one across eight entity types in six schemas is a different, much larger feature.
  const mine = user ? activeProjects.filter((project) => project.leadUserId === user.id) : [];
  const theirs = activeProjects.filter((project) => !mine.includes(project));

  async function setStatus(project: Project, status: 'active' | 'archived') {
    setBusyId(project.id);
    try {
      if (status === 'archived') {
        await archive.mutateAsync(project.id);
      } else {
        await update.mutateAsync({ projectId: project.id, status: 'active' });
      }
    } finally {
      setBusyId(null);
    }
  }

  if (screen.kind === 'form') {
    return (
      <div className="max-w-2xl">
        <button
          type="button"
          onClick={() => setScreen({ kind: 'list' })}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to projects
        </button>
        <ProjectForm
          brandId={brandId}
          initial={screen.project}
          onCancelAction={() => setScreen({ kind: 'list' })}
          onSavedAction={() => setScreen({ kind: 'list' })}
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Button
        variant="brand"
        size="sm"
        className="w-full justify-center"
        onClick={() => setScreen({ kind: 'form', project: null })}
      >
        <Plus className="h-3.5 w-3.5" />
        New project
      </Button>

      {isLoading ? (
        <p className="px-0.5 text-sm text-muted-foreground">Loading projects…</p>
      ) : isError ? (
        <p className="px-0.5 text-sm text-destructive">Could not load projects.</p>
      ) : (
        <>
          {mine.length > 0 ? (
            <ProjectRows
              heading="Led by you"
              projects={mine}
              emptyLabel=""
              busyId={busyId}
              onEditAction={(project) => setScreen({ kind: 'form', project })}
              onStatusAction={(project) => setStatus(project, 'archived')}
            />
          ) : null}
          <ProjectRows
            // Only worth a second heading once there is something to contrast it with.
            heading={mine.length > 0 ? 'Other projects' : 'Projects'}
            projects={theirs}
            emptyLabel={
              mine.length > 0
                ? ''
                : 'No projects yet. Create one to scope a direction — a brief, a colour, and the ad accounts it covers.'
            }
            busyId={busyId}
            onEditAction={(project) => setScreen({ kind: 'form', project })}
            onStatusAction={(project) => setStatus(project, 'archived')}
          />
          {archived.length > 0 ? (
            <ProjectRows
              heading="Archived"
              projects={archived}
              emptyLabel=""
              busyId={busyId}
              onEditAction={(project) => setScreen({ kind: 'form', project })}
              onStatusAction={(project) => setStatus(project, 'active')}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function ProjectRows({
  heading,
  projects,
  emptyLabel,
  busyId,
  onEditAction,
  onStatusAction,
}: {
  heading: string;
  projects: Project[];
  emptyLabel: string;
  busyId: string | null;
  onEditAction: (project: Project) => void;
  onStatusAction: (project: Project) => void;
}) {
  const archivedGroup = heading === 'Archived';

  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      {projects.length === 0 ? (
        <p className="px-0.5 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        projects.map((project) => (
          <div
            key={project.id}
            className="flex items-start justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => onEditAction(project)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-2">
                <ProjectChip project={project} />
                {archivedGroup ? (
                  <span className="text-xs text-muted-foreground">Archived</span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {project.brief ??
                  `${project.adAccountIds.length} ad accounts · ${project.campaignIds.length} campaigns`}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label={`Edit ${project.name}`}
                onClick={() => onEditAction(project)}
                className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`${archivedGroup ? 'Restore' : 'Archive'} ${project.name}`}
                disabled={busyId === project.id}
                onClick={() => onStatusAction(project)}
                className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
              >
                {archivedGroup ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

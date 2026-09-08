'use client';

import type { Project } from '@continuum/contracts';
import { Check, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectMemberships, useProjectMutations, useProjects } from '@/lib/projects/hooks';
import type { DocumentView } from './types';

/**
 * Tag one document into a project, or take it out again.
 *
 * This is the control the whole document half of the project scope was waiting on. The
 * route accepted `entityType: 'brand_document'` and the agent-side reader was benched, but
 * nothing in the product could WRITE such a row — the only way to scope a document to a
 * project was a service-role insert. A feature reachable only by someone with the service
 * key is not a feature.
 *
 * A per-row toggle rather than a bulk toolbar because the document list has no selection
 * model at all, and adding one to gain a second way to do the same thing would be more
 * surface for less clarity. It also gives `untag` its first caller in the codebase: the
 * DELETE handler existed, was tested, and was unreachable, so a mis-tag was permanent.
 */
export function DocumentProjectSubmenu({ brandId, doc }: { brandId: string; doc: DocumentView }) {
  const { projects } = useProjects(brandId);
  const { memberships } = useProjectMemberships(brandId, {
    entityId: doc.id,
    entityType: 'brand_document',
  });
  const { tag, untag } = useProjectMutations(brandId);

  const tagged = new Set(memberships.map((membership) => membership.projectId));
  const busy = tag.isPending || untag.isPending;

  const toggle = async (project: Project) => {
    const isTagged = tagged.has(project.id);
    const mutation = isTagged ? untag : tag;
    try {
      await mutation.mutateAsync({
        projectId: project.id,
        entityType: 'brand_document',
        entityIds: [doc.id],
      });
      toast.success(
        isTagged ? `Removed from ${project.name}` : `Added to ${project.name}`,
        // Naming the consequence, not the row: the point of tagging a document is what the
        // agent then sees, and that is not obvious from "tagged".
        {
          description: isTagged
            ? 'It is brand baseline again, so every project can see it.'
            : `Only ${project.name} will see it now; other projects will not.`,
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the project');
    }
  };

  if (projects.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderOpen className="mr-2 h-3.5 w-3.5" />
        Projects
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            disabled={busy}
            // The menu stays open: tagging one document into three projects is one gesture
            // per project, and a menu that closes after each makes it three round trips.
            onSelect={(event) => {
              event.preventDefault();
              void toggle(project);
            }}
          >
            <Check
              className={`mr-2 h-3.5 w-3.5 ${tagged.has(project.id) ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden
            />
            {project.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

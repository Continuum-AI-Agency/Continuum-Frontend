'use client';

import type { Project } from '@continuum/contracts';
import { Check, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast-imperative';
import { useUiErrorMessage } from '@/i18n/errors';
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
 * surface for less clarity. It is also one of the two first callers `untag` has ever had —
 * the Library toolbar's Untag button is the other — so before them the DELETE handler
 * existed, was tested, and was unreachable, and a mis-tag was permanent.
 */
export function DocumentProjectSubmenu({ brandId, doc }: { brandId: string; doc: DocumentView }) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('common');
  const { projects, isLoading } = useProjects(brandId);
  const { memberships, isFetching: membershipsFetching } = useProjectMemberships(brandId, {
    entityId: doc.id,
    entityType: 'brand_document',
  });
  const { tag, untag } = useProjectMutations(brandId);

  const tagged = new Set(memberships.map((membership) => membership.projectId));
  // A toggle must not act on a list it is in the middle of revalidating. Without this the
  // second click on a just-tagged project reads a stale "not tagged", calls the idempotent
  // upsert again, and the row survives — a mis-tag that cannot be undone, reported as
  // success. It is only visible when someone reopens the menu quickly, which is exactly
  // what undoing a mistake looks like.
  const busy = tag.isPending || untag.isPending || membershipsFetching;

  const toggle = async (project: Project) => {
    if (busy) return;
    const isTagged = tagged.has(project.id);
    const mutation = isTagged ? untag : tag;
    try {
      await mutation.mutateAsync({
        projectId: project.id,
        entityType: 'brand_document',
        entityIds: [doc.id],
      });
      toast.success(
        isTagged
          ? uiText('m_1226fa963f', { v0: String(project.name) })
          : uiText('m_c73d760bf0', { v0: String(project.name) }),
        // Naming the consequence, not the row: the point of tagging a document is what the
        // agent then sees, and that is not obvious from "tagged".
        {
          description: isTagged
            ? uiText('m_c1a465a090')
            : uiText('m_1360c31d13', { v0: String(project.name) }),
        },
      );
    } catch (error) {
      toast.error(getUiErrorMessage(error));
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderOpen className="mr-2 h-3.5 w-3.5" />
        {uiText('m_53e890d5f0')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {/* Rendered even with nothing to list. Hiding a control when the list is empty is
            the exact bug this feature already shipped once — the Library's project control
            returned null at zero projects, which was every brand, so the feature was
            invisible in production. An empty menu that says why is a smaller cost than a
            missing one, and the projects list is one section away on this same page. */}
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>
            {isLoading ? uiText('loading_projects_6970a1c') : uiText('m_f837f5f780')}
          </DropdownMenuItem>
        ) : null}
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

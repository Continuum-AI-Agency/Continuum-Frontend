'use client';

// The project selector.
//
// Popover + Command, not DropdownMenu, for the reason BrandSwitcher documents: a menu popup
// runs its own typeahead and swallows every character key before cmdk's CommandInput sees
// it, so search never filters. This is the pairing every combobox in the app uses.

import type { Project } from '@continuum/contracts';
import { Check, ChevronsUpDown, FolderOpen, Plus } from 'lucide-react';
import * as React from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useActiveProject } from '@/components/projects/ActiveProjectProvider';
import { ProjectChip, projectColor } from '@/components/projects/ProjectChip';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProjectMutations } from '@/lib/projects/hooks';
import { cn } from '@/lib/utils';

type ProjectSelectProps = {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  /** Label for the null option — the brand-level scope. */
  noProjectLabel?: string;
  /**
   * Create a project from the typed name and return its id.
   *
   * Optional: a settings form driving this with its own state has no brand in
   * scope, and a picker that cannot create is still a valid picker. When it is
   * absent the create row simply never appears.
   */
  onCreate?: (name: string) => Promise<string | null>;
  disabled?: boolean;
  className?: string;
};

export function ProjectSelect({
  projects,
  value,
  onChange,
  noProjectLabel = 'No project',
  onCreate,
  disabled,
  className,
}: ProjectSelectProps) {
  const [open, setOpen] = React.useState(false);
  // Controlled so the create row can read what was typed. cmdk's own filtering
  // still runs off this same value.
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const selected = projects.find((project) => project.id === value) ?? null;

  const trimmed = query.trim();
  const canCreate =
    onCreate !== undefined &&
    trimmed.length > 0 &&
    !projects.some((project) => project.name.toLowerCase() === trimmed.toLowerCase());

  const select = (projectId: string | null) => {
    setOpen(false);
    setQuery('');
    setStatus(null);
    onChange(projectId);
  };

  const createAndSelect = async (name: string): Promise<void> => {
    if (!onCreate) return;
    setStatus('Creating…');
    try {
      const projectId = await onCreate(name);
      if (projectId) select(projectId);
      else setStatus('Create failed');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // The route answers 409 on a duplicate active name; saying so beats a
      // generic failure the user cannot act on.
      setStatus(message.includes('409') ? 'A project already has that name' : 'Create failed');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setStatus(null);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select project"
            disabled={disabled}
            className={cn('justify-between gap-2 font-normal', className)}
          >
            {selected ? (
              <ProjectChip project={selected} className="border-0 bg-transparent px-0" />
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <FolderOpen className="size-3.5 shrink-0" />
                {noProjectLabel}
              </span>
            )}
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-64 p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={onCreate ? 'Search or create…' : 'Search projects...'}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>
              {onCreate ? 'Type a name to create a project.' : 'No projects found.'}
            </CommandEmpty>
            <CommandGroup>
              {/* null is the default brand-level scope and must stay reachable — a selector
                  that can only ever narrow is a scope you cannot get out of. */}
              <CommandItem value={noProjectLabel} onSelect={() => select(null)} className="gap-2">
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{noProjectLabel}</span>
                {value === null && <Check className="size-3.5 shrink-0" />}
              </CommandItem>
            </CommandGroup>
            {projects.length > 0 && <CommandSeparator />}
            {projects.length > 0 && (
              <CommandGroup heading="Projects">
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    // cmdk filters on `value`; the id would make search match nothing typeable.
                    value={project.name}
                    onSelect={() => select(project.id)}
                    className="gap-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: projectColor(project.color) }}
                    />
                    <span className="flex-1 truncate">{project.name}</span>
                    {value === project.id && <Check className="size-3.5 shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Create">
                  <CommandItem
                    value={`create ${trimmed}`}
                    onSelect={() => void createAndSelect(trimmed)}
                    className="gap-2"
                  >
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">Create “{trimmed}”</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
        {status && (
          <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            {status}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The selector wired to the active-project context — what a surface with a chip row mounts.
 * Kept separate so a settings form can drive the plain `ProjectSelect` with its own state,
 * with no ActiveProjectProvider in scope.
 */
export function ActiveProjectSelect({ className }: { className?: string }) {
  const { projects, activeProjectId, selectProject, isLoading } = useActiveProject();
  const { activeBrandId } = useActiveBrandContext();
  const { create } = useProjectMutations(activeBrandId);

  // The brand comes from context rather than a prop so the chip row stays a
  // zero-argument mount. Without a brand there is nothing to create under, so
  // the create row stays hidden rather than posting a request that 400s.
  const onCreate = activeBrandId
    ? async (name: string): Promise<string | null> => {
        const project = await create.mutateAsync({ name, adAccountIds: [], campaignIds: [] });
        return project?.id ?? null;
      }
    : undefined;

  return (
    <ProjectSelect
      projects={projects}
      value={activeProjectId}
      onChange={selectProject}
      onCreate={onCreate}
      disabled={isLoading}
      className={className}
    />
  );
}

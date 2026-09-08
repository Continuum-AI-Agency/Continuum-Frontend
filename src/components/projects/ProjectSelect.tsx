'use client';

// The project selector.
//
// Popover + Command, not DropdownMenu, for the reason BrandSwitcher documents: a menu popup
// runs its own typeahead and swallows every character key before cmdk's CommandInput sees
// it, so search never filters. This is the pairing every combobox in the app uses.

import type { Project } from '@continuum/contracts';
import { Check, ChevronsUpDown, FolderOpen } from 'lucide-react';
import * as React from 'react';
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
import { cn } from '@/lib/utils';

type ProjectSelectProps = {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  /** Label for the null option — the brand-level scope. */
  noProjectLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function ProjectSelect({
  projects,
  value,
  onChange,
  noProjectLabel = 'No project',
  disabled,
  className,
}: ProjectSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = projects.find((project) => project.id === value) ?? null;

  const select = (projectId: string | null) => {
    setOpen(false);
    onChange(projectId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <CommandInput placeholder="Search projects..." className="h-9" />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
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
          </CommandList>
        </Command>
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
  return (
    <ProjectSelect
      projects={projects}
      value={activeProjectId}
      onChange={selectProject}
      disabled={isLoading}
      className={className}
    />
  );
}

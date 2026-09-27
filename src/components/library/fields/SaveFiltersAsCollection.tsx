'use client';

// "Save these filters as a collection": the current filter set becomes a smart
// collection whose membership SQL re-evaluates on every read, so an asset tagged or
// assigned later joins it for everyone with no reload (useLibraryLiveRefresh).
// Team is shared with the brand; Private is visible to its creator only — the
// browse RPC and RLS both enforce that, this control only chooses it.

import type {
  CollectionVisibility,
  CustomFieldFilter,
  LibraryMediaType,
  MediaReviewStatus,
  MediaSource,
} from '@continuum/contracts';
import { BookmarkPlus, Loader2, Lock, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast-imperative';
import { createLibraryCollectionOperation } from '@/lib/library/creativeOperations';
import { canEditLibrary, useBrandRole } from '@/lib/library/useBrandRole';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export type SavableFilters = {
  mediaType?: LibraryMediaType;
  createdWith: MediaSource[];
  tags: string[];
  reviewStatuses: MediaReviewStatus[];
  fieldFilters: CustomFieldFilter[];
};

function hasAnyFilter(query: SavableFilters): boolean {
  return (
    (query.mediaType !== undefined && query.mediaType !== 'all') ||
    query.createdWith.length > 0 ||
    query.tags.length > 0 ||
    query.reviewStatuses.length > 0 ||
    query.fieldFilters.length > 0
  );
}

export function SaveFiltersAsCollection({
  brandId,
  query,
  onSaved,
}: {
  brandId: string;
  query: SavableFilters;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<CollectionVisibility>('team');
  const [saving, setSaving] = useState(false);
  const canEdit = canEditLibrary(useBrandRole(brandId));
  if (!canEdit || !hasAnyFilter(query)) return null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const collection = await createLibraryCollectionOperation(createSupabaseBrowserClient(), {
        brandId,
        name: trimmed,
        kind: 'smart',
        visibility,
        smartQuery: {
          brandId,
          mediaType: query.mediaType ?? 'all',
          createdWith: query.createdWith,
          tags: query.tags,
          reviewStatuses: query.reviewStatuses,
          ...(query.fieldFilters.length > 0 ? { fieldFilters: query.fieldFilters } : {}),
        },
      });
      setOpen(false);
      setName('');
      onSaved?.();
      // The collection now carries the filters, so open it rather than stacking the
      // same filters on top of it.
      router.push(`/library?collection=${encodeURIComponent(collection.id)}`);
      router.refresh();
    } catch (err) {
      toast.error(`Saving the collection failed · ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.96]"
          >
            <BookmarkPlus className="size-3.5" />
            Save as collection
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <p className="text-xs font-medium">Save these filters as a collection</p>
        <p className="text-2xs text-muted-foreground">
          It stays live: assets that match later join it on their own.
        </p>
        <Input
          value={name}
          autoFocus
          placeholder="Collection name"
          aria-label="Collection name"
          className="h-8 text-xs"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            }
          }}
        />
        <fieldset
          aria-label="Who can see it"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-0.5"
        >
          {(
            [
              { value: 'team', label: 'Team', icon: Users },
              { value: 'private', label: 'Private', icon: Lock },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={visibility === option.value}
              onClick={() => setVisibility(option.value)}
              className={cn(
                'flex min-h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                visibility === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <option.icon className="size-3.5" />
              {option.label}
            </button>
          ))}
        </fieldset>
        <Button
          type="button"
          size="sm"
          className="h-8 w-full"
          disabled={!name.trim() || saving}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save collection
        </Button>
      </PopoverContent>
    </Popover>
  );
}

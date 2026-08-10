'use client';

import { Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  mergeLibraryTagsOperation,
  renameLibraryTagOperation,
} from '@/lib/library/creativeOperations';
import type { LibraryTagOption } from '@/lib/media/filters';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LibraryTagManager({
  brandId,
  options,
  onCompleted,
}: {
  brandId: string;
  options: readonly LibraryTagOption[];
  onCompleted: (sourceTags: string[], targetTag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'rename' | 'merge'>('rename');
  const [sourceTag, setSourceTag] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [targetTag, setTargetTag] = useState('');
  const [busy, setBusy] = useState(false);
  const sourceTags = mode === 'rename' ? (sourceTag ? [sourceTag] : []) : selectedSources;
  const normalizedTarget = targetTag.trim().toLocaleLowerCase();
  const canSubmit =
    sourceTags.length > 0 &&
    normalizedTarget.length > 0 &&
    !sourceTags.some((tag) => tag.toLocaleLowerCase() === normalizedTarget) &&
    !busy;
  const alphabetical = useMemo(
    () => options.toSorted((left, right) => left.tag.localeCompare(right.tag)),
    [options],
  );

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const client = createSupabaseBrowserClient();
      const result =
        mode === 'rename'
          ? await renameLibraryTagOperation(client, {
              brandId,
              fromTag: sourceTags[0],
              toTag: normalizedTarget,
            })
          : await mergeLibraryTagsOperation(client, {
              brandId,
              sourceTags,
              targetTag: normalizedTarget,
            });
      toast.success(
        `${result.updatedAssetCount} asset${result.updatedAssetCount === 1 ? '' : 's'} updated`,
      );
      onCompleted(sourceTags, result.canonicalTag);
      setSourceTag('');
      setSelectedSources([]);
      setTargetTag('');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Updating tags failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground">
            <Tags className="size-3.5" />
            Manage tags
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage tags</DialogTitle>
          <DialogDescription>
            Rename one tag or merge duplicates across every asset in this brand. System tags stay
            protected.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex gap-1 rounded-lg bg-muted p-1">
          <legend className="sr-only">Tag operation</legend>
          {(['rename', 'merge'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                mode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {value}
            </button>
          ))}
        </fieldset>
        {mode === 'rename' ? (
          <Select value={sourceTag} onValueChange={setSourceTag}>
            <SelectTrigger aria-label="Tag to rename">
              <SelectValue placeholder="Choose a tag" />
            </SelectTrigger>
            <SelectContent>
              {alphabetical.map(({ tag, count }) => (
                <SelectItem key={tag} value={tag}>
                  {tag} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <fieldset className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Tags to merge
            </legend>
            {alphabetical.map(({ tag, count }) => (
              <label key={tag} className="flex min-h-8 items-center gap-2 rounded px-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSources.includes(tag)}
                  onChange={() =>
                    setSelectedSources((current) =>
                      current.includes(tag)
                        ? current.filter((item) => item !== tag)
                        : [...current, tag],
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate">{tag}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              </label>
            ))}
          </fieldset>
        )}
        <Input
          value={targetTag}
          onChange={(event) => setTargetTag(event.target.value)}
          placeholder={mode === 'rename' ? 'New tag name' : 'Merge into…'}
          aria-label={mode === 'rename' ? 'New tag name' : 'Target tag'}
          maxLength={80}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Updating…' : mode === 'rename' ? 'Rename tag' : 'Merge tags'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

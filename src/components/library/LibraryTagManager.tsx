'use client';

import { Tags } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
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
import { toast } from '@/components/ui/toast-imperative';
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
  const translateUi = useUiTranslations('library');

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
        translateUi('value0_asset_value1_updated_4be6df52', {
          count: Number(result.updatedAssetCount),
        }),
      );
      onCompleted(sourceTags, result.canonicalTag);
      setSourceTag('');
      setSelectedSources([]);
      setTargetTag('');
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('updating_tags_failed_65227219'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground">
            <Tags className="size-3.5" /> {translateUi('manage_tags_0b4ee559')}{' '}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translateUi('manage_tags_0b4ee559')}</DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('rename_one_tag_or_merge_duplicates__22cd061c')}{' '}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex gap-1 rounded-lg bg-muted p-1">
          <legend className="sr-only">{translateUi('tag_operation_402af857')}</legend>
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
            <SelectTrigger aria-label={translateUi('tag_to_rename_c0572d76')}>
              <SelectValue placeholder={translateUi('choose_a_tag_56211827')} />
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
              {' '}
              {translateUi('tags_to_merge_8a524354')}{' '}
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
          placeholder={
            mode === 'rename'
              ? translateUi('new_tag_name_4f8db033')
              : translateUi('merge_into_2eb1fd03')
          }
          aria-label={
            mode === 'rename'
              ? translateUi('new_tag_name_4f8db033')
              : translateUi('target_tag_50da6cab')
          }
          maxLength={80}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {' '}
            {translateUi('cancel_19766ed6')}{' '}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy
              ? translateUi('updating_dfe40efe')
              : mode === 'rename'
                ? translateUi('rename_tag_40ab1c37')
                : translateUi('merge_tags_c617353a')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

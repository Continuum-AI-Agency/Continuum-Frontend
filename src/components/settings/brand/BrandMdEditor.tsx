'use client';

import { parseBrandMd } from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { useToast } from '@/components/ui/ToastProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resetBrandMd, saveBrandMd } from '@/lib/api/brandBook.client';
import { useBrandMdDirty } from './BrandMdDirtyContext';

type Props = {
  brandId: string;
  // Null when brand.md has not been generated yet (un-migrated brand).
  initialBrandMd: string | null;
  isEdited: boolean;
};

export function canSaveBrandMd(draft: string): boolean {
  const hasFrontMatter = draft.trimStart().startsWith('---');
  return !hasFrontMatter || parseBrandMd(draft).tokens !== null;
}

// Raw textarea + live preview editor for brand.md (YAML front matter + prose body).
// Front-matter validity is derived via parseBrandMd and shown as a non-blocking hint.
// Save/reset write through saveBrandMd / resetBrandMd and then router.refresh() so
// the parent RSC re-fetches the updated envelope.
export function BrandMdEditor({ brandId, initialBrandMd, isEdited }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const { setDirty } = useBrandMdDirty();

  const [draft, setDraft] = useState(initialBrandMd ?? '');
  const [isPending, startTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();

  // Track whether the current draft differs from the last-saved value.
  const savedRef = useRef(initialBrandMd ?? '');
  const dirty = draft !== savedRef.current;

  // Keep the context dirty flag in sync so BrandBookActions can suppress refresh.
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  // When the parent RSC refreshes (e.g. after a reset), re-sync local draft.
  useEffect(() => {
    const next = initialBrandMd ?? '';
    savedRef.current = next;
    setDraft(next);
  }, [initialBrandMd]);

  const parsed = parseBrandMd(draft);
  const frontMatterValid = parsed.tokens !== null;
  // If there is no front-matter fence at all, show "not present" rather than "invalid".
  const hasFrontMatter = draft.trimStart().startsWith('---');
  const saveIsValid = canSaveBrandMd(draft);

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await saveBrandMd(brandId, draft);
        const saved = result.brand_md ?? draft;
        savedRef.current = saved;
        setDraft(saved);
        setDirty(false);
        show({ title: 'Brand document saved', variant: 'success' });
        router.refresh();
      } catch (e) {
        show({
          title: 'Save failed',
          description: e instanceof Error ? e.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  };

  const handleReset = () => {
    startResetTransition(async () => {
      try {
        const result = await resetBrandMd(brandId);
        const next = result.brand_md ?? '';
        savedRef.current = next;
        setDraft(next);
        setDirty(false);
        show({ title: 'Reverted to generated document', variant: 'success' });
        router.refresh();
      } catch (e) {
        show({
          title: 'Revert failed',
          description: e instanceof Error ? e.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  };

  if (initialBrandMd === null) {
    return (
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">No brand document generated yet.</p>
        <p className="text-xs text-muted-foreground">
          Run "Deepen analysis" to generate your brand.md, then return here to edit.
        </p>
      </div>
    );
  }

  const isBusy = isPending || isResetting;

  return (
    <div className="space-y-3">
      {/* Header row: title + badges + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">brand.md</span>
          {isEdited && !dirty ? <Pill variant="warning">Edited</Pill> : null}
          {dirty ? <Pill variant="teal">Unsaved changes</Pill> : null}
          {hasFrontMatter ? (
            <Pill variant={frontMatterValid ? 'success' : 'destructive'}>
              front matter: {frontMatterValid ? 'valid' : 'invalid'}
            </Pill>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isEdited ? (
            <Button
              onClick={handleReset}
              disabled={isBusy}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              {isResetting ? 'Reverting…' : 'Revert to generated'}
            </Button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={isBusy || !dirty || !saveIsValid}
            variant="secondary"
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {!saveIsValid ? (
        <p className="text-xs text-destructive" role="alert">
          Fix the front matter before saving so structured brand colors, voice, and audience remain
          usable across Continuum.
        </p>
      ) : null}

      {/* Tab: Edit | Preview */}
      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="pt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="brand.md editor"
          />
        </TabsContent>

        <TabsContent value="preview" className="pt-3">
          <div className="min-h-[200px] rounded-md border border-border/60 bg-muted/30 px-4 py-3">
            {parsed.body.trim() ? (
              <SafeMarkdown
                content={parsed.body}
                mode="static"
                className="prose prose-invert prose-sm max-w-none"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

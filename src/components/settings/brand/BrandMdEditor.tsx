'use client';

import { parseBrandMd } from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { useToast } from '@/components/ui/ToastProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUiErrorMessage } from '@/i18n/errors';
import { resetBrandMd, saveBrandMd } from '@/lib/api/brandBook.client';
import { BrandBrainSections } from './BrandBrain/BrandBrainSections';
import { readBrainDoc, writeBrainDoc } from './BrandBrain/brandBrain';
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

// brand.md editor: the Brand Brain sections by default, the raw document (YAML front
// matter + prose body) as the escape hatch, and a preview. All three edit one draft string.
// Front-matter validity is derived via parseBrandMd and shown as a non-blocking hint.
// Save/reset write through saveBrandMd / resetBrandMd and then router.refresh() so
// the parent RSC re-fetches the updated envelope.
export function BrandMdEditor({ brandId, initialBrandMd, isEdited }: Props) {
  const tUi = useTranslations('settings');
  const uiErrorMessage = useUiErrorMessage();

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
  const brainDoc = parsed.tokens ? { tokens: parsed.tokens, body: parsed.body } : null;
  // Chosen once: a document the sections cannot parse opens on the raw view.
  const [initialTab] = useState(() => (readBrainDoc(initialBrandMd ?? '') ? 'sections' : 'raw'));
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
        show({ title: tUi('m_1a48a3ee2e'), variant: 'success' });
        router.refresh();
      } catch (e) {
        show({
          title: tUi('m_0a44446762'),
          description: uiErrorMessage(e),
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
        show({ title: tUi('m_97edb9fa66'), variant: 'success' });
        router.refresh();
      } catch (e) {
        show({
          title: tUi('m_f644fbc626'),
          description: uiErrorMessage(e),
          variant: 'error',
        });
      }
    });
  };

  if (initialBrandMd === null) {
    return (
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">{tUi('m_fd3ae2ec75')}</p>
        <p className="text-xs text-muted-foreground">{tUi('m_bc6ffd536a')}</p>
      </div>
    );
  }

  const isBusy = isPending || isResetting;

  return (
    <div className="space-y-3">
      {/* Header row: title + badges + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{tUi('m_885a3bba72')}</span>
          {isEdited && !dirty ? <Pill variant="warning">{tUi('m_978e8c3322')}</Pill> : null}
          {dirty ? <Pill variant="teal">{tUi('m_29267269c0')}</Pill> : null}
          {hasFrontMatter ? (
            <Pill variant={frontMatterValid ? 'success' : 'destructive'}>
              {tUi('m_d6133dbd6a')}
              {frontMatterValid ? tUi('m_bec262808f') : tUi('m_81f344a768')}
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
              {isResetting ? tUi('m_a4eeb16eef') : tUi('m_61b9bbd0a9')}
            </Button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={isBusy || !dirty || !saveIsValid}
            variant="secondary"
          >
            {isPending ? tUi('m_56a2285c5b') : tUi('m_efc007a393')}
          </Button>
        </div>
      </div>
      {!saveIsValid ? (
        <p className="text-xs text-destructive" role="alert">
          {tUi('m_ab8debeb7c')}
        </p>
      ) : null}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="sections">{tUi('m_7ff5a6dafd')}</TabsTrigger>
          <TabsTrigger value="raw">{tUi('m_719e6c377a')}</TabsTrigger>
          <TabsTrigger value="preview">{tUi('m_f1fbb2b43d')}</TabsTrigger>
        </TabsList>

        <TabsContent value="sections" className="pt-3">
          {brainDoc ? (
            <BrandBrainSections
              doc={brainDoc}
              onChange={(next) => setDraft(writeBrainDoc(next))}
              disabled={isBusy}
            />
          ) : (
            <p className="rounded-md border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              {tUi('m_2f350849ac')}
            </p>
          )}
        </TabsContent>

        <TabsContent value="raw" className="pt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={tUi('m_f2cdbcb7bd')}
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
              <p className="text-sm text-muted-foreground">{tUi('m_3b7f7df57c')}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

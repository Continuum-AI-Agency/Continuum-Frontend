'use client';

// Rebuilds the Brand DNA from the user's own evidence: a (corrected) website and, optionally,
// their own description of the business, their uploaded brand documents, a public Instagram or
// Facebook page and the voice tags they pick. Built for the case where onboarding read the wrong site, so the old inferences are
// not passed along. The user's edits are replaced only if they ask, and only by the Backend once
// the new analysis is stored.

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sha256Hex } from '@continuum/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { Link } from '@/i18n/navigation';
import { fetchBrandBookClient } from '@/lib/brands/useBrandBook.client';
import {
  approveOnboardingBrandProfile,
  fetchPreviewStatus,
  PreviewRateLimitedError,
  runOnboardingPreview,
} from '@/lib/onboarding/agentClient';
import { BRAND_VOICE_TAGS } from '@/lib/onboarding/state';
import {
  type BrandBookGenerationPayload,
  BrandBookRunIncompleteError,
  brandBookGenerationStatus,
  brandBookReanalysisPayload,
  reanalysisOutcome,
  runBrandBookGeneration,
  waitForBrandBookRefresh,
} from './brandBookGeneration';

export type ReanalysisDocument = { id: string; name: string };

export function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

export function BrandDnaReanalyze({
  brandId,
  payload,
  currentWebsite,
  editedBrandMd,
  documents,
  refreshedAt,
}: {
  brandId: string;
  payload: BrandBookGenerationPayload;
  currentWebsite: string | null;
  // The user's edit as stored, or null when the book is the generated one.
  editedBrandMd: string | null;
  // The brand's ready documents; each can ground the new run.
  documents: ReanalysisDocument[];
  // When the book on screen was built; the dialog waits for a newer one before refreshing.
  refreshedAt: string | null;
}) {
  const tUi = useTranslations('settings');
  const isEdited = editedBrandMd !== null;
  const uiErrorMessage = useUiErrorMessage();
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [website, setWebsite] = useState(currentWebsite ?? '');
  // Prefilled with what the user wrote at onboarding: their words, not an inference.
  const [description, setDescription] = useState(payload.intake?.description ?? '');
  // Empty: the stored audience is what the earlier run inferred, not what the user said.
  const [audience, setAudience] = useState('');
  const [documentIds, setDocumentIds] = useState(() => documents.map((doc) => doc.id));
  const [socialUrl, setSocialUrl] = useState('');
  const [socialInvalid, setSocialInvalid] = useState(false);
  // The tags the user picked at onboarding: their choice, so they carry over unless changed.
  const [voiceTags, setVoiceTags] = useState<string[]>(() =>
    payload.runContext.brand_voice_tags.filter((tag) =>
      (BRAND_VOICE_TAGS as readonly string[]).includes(tag),
    ),
  );
  // Off by default: replacing the user's corrections is a choice they make, not a side effect.
  const [discardEdits, setDiscardEdits] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ids = {
    website: useId(),
    websiteError: useId(),
    description: useId(),
    descriptionHint: useId(),
    audience: useId(),
    audienceHint: useId(),
    discard: useId(),
    documents: useId(),
    social: useId(),
    socialHint: useId(),
    socialError: useId(),
    voice: useId(),
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const toggle =
    (set: (update: (current: string[]) => string[]) => void) => (id: string, checked: boolean) =>
      set((current) =>
        checked ? [...current, id] : current.filter((candidate) => candidate !== id),
      );
  const toggleDocument = toggle(setDocumentIds);
  const toggleVoiceTag = toggle(setVoiceTags);

  const handleReanalyze = async () => {
    const url = normalizeWebsiteUrl(website);
    const social = socialUrl.trim() ? normalizeWebsiteUrl(socialUrl) : null;
    const socialBad = socialUrl.trim() !== '' && !social;
    setInvalid(!url);
    setSocialInvalid(socialBad);
    if (!url || socialBad) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStatusLine(tUi('generationStarting'));
    try {
      // Loaded on demand: the scrape client brings onboarding telemetry, which Settings never needs.
      const { readOnboardingSource } = await import('@/components/onboarding/v2/state/jobRunners');
      const [source, socialSource] = await Promise.all([
        readOnboardingSource(brandId, url, controller.signal),
        social ? readOnboardingSource(brandId, social, controller.signal) : null,
      ]);
      // The page field takes a social profile only; a website there is a typo, not evidence.
      if (socialSource?.kind === 'web') {
        setSocialInvalid(true);
        return;
      }
      const scrape = source.kind === 'web' ? source.scrape : null;
      const websiteUrl = scrape?.url ?? url;
      const discardEditSha256 =
        editedBrandMd !== null && discardEdits ? await sha256Hex(editedBrandMd) : null;
      const { runId } = await runBrandBookGeneration({
        payload: brandBookReanalysisPayload(payload, {
          websiteUrl,
          scrape,
          description,
          audience,
          documentIds,
          social:
            socialSource?.kind === 'instagram'
              ? { instagram_profile: socialSource.instagram_profile }
              : socialSource?.kind === 'facebook'
                ? { facebook_profile: socialSource.facebook_profile }
                : undefined,
          voiceTags,
          discardEditSha256,
        }),
        signal: controller.signal,
        onEvent: (event) => {
          const line = brandBookGenerationStatus(event, tUi);
          if (line) setStatusLine(line);
        },
        runPreview: runOnboardingPreview,
        approve: approveOnboardingBrandProfile,
      });
      setStatusLine(tUi('brandDnaReanalyzeUpdating'));
      const fresh = await waitForBrandBookRefresh({
        brandId,
        refreshedBefore: refreshedAt,
        fetchBook: fetchBrandBookClient,
        signal: controller.signal,
      });
      const status =
        fresh || !runId
          ? null
          : await fetchPreviewStatus(runId, { signal: controller.signal }).catch(() => null);
      if (controller.signal.aborted) return;
      const outcome = reanalysisOutcome({
        fresh,
        commitError: status?.commitError ?? null,
        keptEdits: isEdited && !discardEdits,
        discardRequested: discardEditSha256 !== null,
      });
      show({
        title: tUi(outcome.title),
        description: tUi(outcome.description, { url: websiteUrl }),
        variant: outcome.variant,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      show({
        title: tUi('brandDnaReanalyzeFailed'),
        description:
          error instanceof PreviewRateLimitedError
            ? tUi('brandPreviewRateLimited', { seconds: error.retryAfterSeconds })
            : error instanceof BrandBookRunIncompleteError
              ? tUi('brandBookRunIncomplete')
              : uiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setRunning(false);
      setStatusLine(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !running && setOpen(next)}>
      <DialogTrigger render={<Button variant="secondary">{tUi('brandDnaReanalyze')}</Button>} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogTitle>{tUi('brandDnaReanalyzeTitle')}</DialogTitle>
        <DialogDescription>{tUi('brandDnaReanalyzeDescription')}</DialogDescription>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={ids.website} className="text-sm text-muted-foreground">
            {tUi('brandDnaReanalyzeUrlLabel')}
          </label>
          <Input
            id={ids.website}
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            value={website}
            disabled={running}
            aria-invalid={invalid}
            aria-describedby={invalid ? ids.websiteError : undefined}
            onChange={(event) => {
              setWebsite(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid ? (
            <p id={ids.websiteError} className="text-xs text-destructive" role="alert">
              {tUi('brandDnaReanalyzeInvalidUrl')}
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={ids.description} className="text-sm text-muted-foreground">
            {tUi('brandDnaReanalyzeOwnWordsLabel')}
          </label>
          <Textarea
            id={ids.description}
            value={description}
            maxLength={8000}
            rows={3}
            disabled={running}
            aria-describedby={ids.descriptionHint}
            onChange={(event) => setDescription(event.target.value)}
          />
          <p id={ids.descriptionHint} className="text-xs text-muted-foreground">
            {tUi('brandDnaReanalyzeOwnWordsHint')}
          </p>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={ids.audience} className="text-sm text-muted-foreground">
            {tUi('brandDnaReanalyzeAudienceLabel')}
          </label>
          <Textarea
            id={ids.audience}
            value={audience}
            maxLength={1800}
            rows={2}
            disabled={running}
            aria-describedby={ids.audienceHint}
            onChange={(event) => setAudience(event.target.value)}
          />
          <p id={ids.audienceHint} className="text-xs text-muted-foreground">
            {tUi('brandDnaReanalyzeAudienceHint')}
          </p>
        </div>
        <fieldset className="mt-3 flex flex-col gap-2" aria-describedby={ids.documents}>
          <legend className="text-sm text-muted-foreground">
            {tUi('brandDnaReanalyzeDocumentsLabel')}
          </legend>
          {documents.map((doc) => {
            const checkboxId = `${ids.documents}-${doc.id}`;
            return (
              <div key={doc.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={checkboxId}
                  checked={documentIds.includes(doc.id)}
                  disabled={running}
                  onCheckedChange={(checked) => toggleDocument(doc.id, checked === true)}
                />
                <label htmlFor={checkboxId} className="truncate">
                  {doc.name}
                </label>
              </div>
            );
          })}
          <p id={ids.documents} className="text-xs text-muted-foreground">
            {documents.length > 0
              ? tUi('brandDnaReanalyzeDocumentsHint')
              : tUi('brandDnaReanalyzeNoDocuments')}{' '}
            <Link href="/settings?section=knowledge" className="underline underline-offset-2">
              {tUi('brandDnaManageDocuments')}
            </Link>
          </p>
        </fieldset>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={ids.social} className="text-sm text-muted-foreground">
            {tUi('brandDnaReanalyzeSocialLabel')}
          </label>
          <Input
            id={ids.social}
            type="url"
            inputMode="url"
            placeholder="https://instagram.com/yourbrand"
            value={socialUrl}
            disabled={running}
            aria-invalid={socialInvalid}
            aria-describedby={socialInvalid ? ids.socialError : ids.socialHint}
            onChange={(event) => {
              setSocialUrl(event.target.value);
              setSocialInvalid(false);
            }}
          />
          {socialInvalid ? (
            <p id={ids.socialError} className="text-xs text-destructive" role="alert">
              {tUi('brandDnaReanalyzeSocialInvalid')}
            </p>
          ) : (
            <p id={ids.socialHint} className="text-xs text-muted-foreground">
              {tUi('brandDnaReanalyzeSocialHint')}
            </p>
          )}
        </div>
        <fieldset className="mt-3 flex flex-col gap-2" aria-describedby={ids.voice}>
          <legend className="text-sm text-muted-foreground">
            {tUi('brandDnaReanalyzeVoiceLabel')}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {BRAND_VOICE_TAGS.map((tag) => {
              const checkboxId = `${ids.voice}-${tag}`;
              return (
                <div key={tag} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={checkboxId}
                    checked={voiceTags.includes(tag)}
                    disabled={running}
                    onCheckedChange={(checked) => toggleVoiceTag(tag, checked === true)}
                  />
                  <label htmlFor={checkboxId}>{tag}</label>
                </div>
              );
            })}
          </div>
          <p id={ids.voice} className="text-xs text-muted-foreground">
            {tUi('brandDnaReanalyzeVoiceHint')}
          </p>
        </fieldset>
        {isEdited ? (
          <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              id={ids.discard}
              checked={discardEdits}
              disabled={running}
              onCheckedChange={(checked) => setDiscardEdits(checked === true)}
            />
            <label htmlFor={ids.discard}>{tUi('brandDnaReanalyzeDiscardEdits')}</label>
          </div>
        ) : null}
        {running && statusLine ? (
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            {statusLine}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={running}>
            {tUi('m_77dfd2135f')}
          </Button>
          <Button onClick={handleReanalyze} disabled={running}>
            {running ? tUi('brandDnaReanalyzeRunning') : tUi('brandDnaReanalyzeSubmit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

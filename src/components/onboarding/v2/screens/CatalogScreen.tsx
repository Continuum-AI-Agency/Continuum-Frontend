'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

// The product-catalog step — the front door of `POST /api/media/elements/catalog`.
//
// Three things this screen refuses to do, each because the endpoint was built so it
// would not have to:
//
//  1. It does not judge a row. `partitionElementCatalog` is the authority; a row the
//     Frontend dropped never appears in the server's report, so the brand is never told
//     which product did not import. Everything typed goes up, and the REPORT comes back.
//  2. It does not collapse a partial success into "import failed". Three of four landing
//     is three products the brand now has, and the fourth is a row number and a reason.
//  3. It does not imply a fact it does not have. A price we could not read is shown as
//     the raw text the brand typed next to why we could not read it — never as 0.00.
//
// Re-running is safe by construction: the server resolves identity SKU-first, then slug,
// so a second run UPDATES. The summary says "updated", because "imported 4 products"
// after a re-run is how somebody concludes they now hold eight.

import { Package, Trash, UploadSimple, Warning } from '@phosphor-icons/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { importElementCatalog, listElements } from '@/lib/ai-studio/elements';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import {
  buildCatalogRow,
  type CatalogImportSummary,
  type CatalogProductDraft,
  readPrice,
  rejectionDetail,
  summarizeImport,
} from '@/lib/onboarding/catalog';
import { cn } from '@/lib/utils';

import { HelpPopover } from '../HelpPopover';

type RejectedRow = {
  index: number;
  name: string | null;
  reason: string;
  issues: string[];
};

type CatalogScreenProps = {
  totalSteps: number;
  /**
   * Raised while images are uploading or an import is in flight. The parent holds
   * Continue for the duration — the same contract DocumentsScreen has, and for the same
   * reason: advancing mid-import leaves the brand on another screen while rows are still
   * landing, with the per-row report rendered to a component that has unmounted.
   */
  onBusyChange?: (busy: boolean) => void;
};

const nameFromFileName = (fileName: string): string =>
  fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 200) || 'Untitled product';

const newKey = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `draft-${Math.random().toString(36).slice(2)}`;

export function CatalogScreen({ totalSteps, onBusyChange }: CatalogScreenProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('onboarding');
  const uiLocale = useLocale();

  const { brandId } = useOnboarding();
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [drafts, setDrafts] = useState<CatalogProductDraft[]>([]);
  const [uploading, setUploading] = useState(0);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<CatalogImportSummary | null>(null);
  const [rejected, setRejected] = useState<RejectedRow[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const busy = uploading > 0 || importing;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const patchDraft = (key: string, patch: Partial<CatalogProductDraft>) =>
    setDrafts((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handleFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/'));
      const skipped = files.length - images.length;
      if (skipped > 0) {
        show({
          title: tUi('m_14b6f63ab0'),
          description: tUi('productImagesSkipped', { count: skipped }),
          variant: 'error',
        });
      }
      if (images.length === 0) return;

      setUploading((count) => count + images.length);
      for (const file of images) {
        try {
          const uploaded = await uploadMediaAsset({ file, brandId });
          setDrafts((prev) => [
            ...prev,
            {
              key: newKey(),
              name: nameFromFileName(file.name),
              sku: '',
              price: '',
              productUrl: '',
              variants: '',
              assetIds: [uploaded.assetId],
              previewUrls: [uploaded.signedUrl],
            },
          ]);
        } catch (error) {
          show({
            title: tUi('m_ee6c2b80e7', { v0: String(file.name) }),
            description: error instanceof Error ? uiErrorMessage(error) : tUi('m_820bc61e81'),
            variant: 'error',
          });
        } finally {
          setUploading((count) => Math.max(0, count - 1));
        }
      }
    },
    [brandId, show, tUi, uiErrorMessage],
  );

  const handleImport = async () => {
    if (drafts.length === 0 || busy) return;
    setImporting(true);
    setSummary(null);
    setRejected([]);
    try {
      // What the brand held BEFORE this submission is the only way to tell an added
      // product from an updated one — the response reports the slug that persisted, not
      // whether it was new.
      const held = await listElements(brandId).catch(() => []);
      const heldSlugs = new Set(held.map((element) => element.slug));

      const response = await importElementCatalog({
        brandId,
        category: 'product',
        rows: drafts.map((draft) => buildCatalogRow(draft, undefined, uiLocale).row),
      });

      setSummary(summarizeImport(response, heldSlugs, tUi));
      setRejected(
        response.rejected.map((row) => ({
          index: row.index,
          name: row.name,
          reason: row.reason,
          issues: row.issues,
        })),
      );
      // The rows that landed are done; leaving them in the editor invites a second
      // import of the same products. The rejected ones stay so they can be fixed.
      const rejectedIndexes = new Set(response.rejected.map((row) => row.index));
      setDrafts((prev) => prev.filter((_, index) => rejectedIndexes.has(index)));
    } catch (error) {
      show({
        title: tUi('m_3284f442c9'),
        description: error instanceof Error ? uiErrorMessage(error) : tUi('m_83a6fd7b78'),
        variant: 'error',
      });
    } finally {
      setImporting(false);
    }
  };

  const importLabel = importing
    ? tUi('m_820599da89')
    : tUi('importProductCount', { count: drafts.length });

  return (
    <div className="flex flex-1 justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_22%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
            <Package className="h-3 w-3" />
            {tUi('m_e043eb1430')}
            {totalSteps}
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-foreground md:text-[2.5rem]">
              {tUi('m_bea0eec6ce')}
            </h1>
            <HelpPopover label={tUi('m_89e5cd6e70')}>
              <p className="font-semibold text-foreground">{tUi('m_89e5cd6e70')}</p>
              <p className="text-muted-foreground">{tUi('m_b0cb06077a')}</p>
            </HelpPopover>
          </div>
          <p className="mx-auto mt-3 max-w-lg text-[0.875rem] leading-relaxed text-muted-foreground">
            {tUi('m_5a2327862f')}
          </p>
        </div>

        {/* Drag-and-drop is a pointer-only convenience; the Add-photos button is the
            keyboard path. Same shape as the documents step. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target, with a button alternative inside */}
        <section
          aria-label={tUi('m_510d899392')}
          data-testid="catalog-dropzone"
          onDragEnter={(event) => {
            event.preventDefault();
            if (event.dataTransfer.types.includes('Files')) setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void handleFiles(Array.from(event.dataTransfer.files ?? []));
          }}
          className={cn(
            'rounded-lg border border-dashed border-border p-6 text-center motion-safe:transition-colors',
            dragActive &&
              'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]',
          )}
        >
          <input
            ref={inputRef}
            data-testid="catalog-file-input"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              void handleFiles(files);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
          <p className="text-sm text-foreground">
            {drafts.length === 0 ? tUi('m_c8773d8b4d') : tUi('m_edc9279760')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{tUi('m_e2042bdbf7')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
          >
            <UploadSimple className="mr-1.5 h-4 w-4" />
            {uploading > 0 ? tUi('productUploading', { count: uploading }) : tUi('m_a59893579b')}
          </Button>
        </section>

        {drafts.length > 0 ? (
          <ul className="mt-6 space-y-3" data-testid="catalog-draft-list">
            {drafts.map((draft, index) => (
              <DraftRow
                key={draft.key}
                draft={draft}
                position={index + 1}
                disabled={importing}
                onChange={(patch) => patchDraft(draft.key, patch)}
                onRemove={() => setDrafts((prev) => prev.filter((row) => row.key !== draft.key))}
              />
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="catalog-import"
            onClick={() => void handleImport()}
            disabled={drafts.length === 0 || busy}
          >
            {importLabel}
          </Button>
          {/* Every disabled control explains its own disabled-ness. */}
          <p className="text-xs text-muted-foreground" data-testid="catalog-import-hint">
            {drafts.length === 0
              ? tUi('m_a42649f809')
              : uploading > 0
                ? tUi('m_5c31632086')
                : importing
                  ? tUi('m_8ef5f9dd7c')
                  : tUi('m_6039857502')}
          </p>
        </div>

        {summary ? (
          <div
            className="mt-6 rounded-lg border border-border p-4"
            data-testid="catalog-result"
            data-added={summary.added}
            data-updated={summary.updated}
            data-rejected={summary.rejected}
          >
            <p className="text-sm font-semibold text-foreground" data-testid="catalog-headline">
              {summary.headline}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <Count
                label={tUi('m_b68734c259')}
                value={summary.added}
                testId="catalog-count-added"
              />
              <Count
                label={tUi('m_f2f8570ddd')}
                value={summary.updated}
                testId="catalog-count-updated"
              />
              <Count
                label={tUi('m_67edb75bd9')}
                value={summary.rejected}
                testId="catalog-count-rejected"
              />
            </dl>

            {rejected.length > 0 ? (
              <ul className="mt-4 space-y-2" data-testid="catalog-rejected-list">
                {rejected.map((row) => (
                  <li
                    key={`${row.index}-${row.reason}`}
                    data-testid="catalog-rejected-row"
                    data-row-index={row.index}
                    className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Warning className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="tabular-nums">
                        {tUi('m_c553701d90')}
                        {row.index + 1}
                      </span>
                      {row.name ? (
                        <span className="text-muted-foreground">— {row.name}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 pl-[1.375rem] text-xs text-muted-foreground">
                      {rejectionDetail(row.issues, tUi)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A number compared down a column is tabular, so the digits line up. */
function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-base tabular-nums text-foreground" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function DraftRow({
  draft,
  position,
  disabled,
  onChange,
  onRemove,
}: {
  draft: CatalogProductDraft;
  position: number;
  disabled: boolean;
  onChange: (patch: Partial<CatalogProductDraft>) => void;
  onRemove: () => void;
}) {
  const tUi = useTranslations('onboarding');
  const uiLocale = useLocale();
  const format = useFormatter();
  const priceExample = format.number(19.99, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const priceReading = readPrice(draft.price, undefined, uiLocale);
  return (
    <li
      className="rounded-lg border border-border p-3"
      data-testid="catalog-draft-row"
      data-position={position}
    >
      <div className="flex gap-3">
        {draft.previewUrls[0] ? (
          // biome-ignore lint/performance/noImgElement: a signed one-hour storage URL, not a static asset
          <img
            src={draft.previewUrls[0]}
            alt=""
            className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
            <Package className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{position}</span>
            <Input
              aria-label={tUi('m_fd8fb8fa84', { v0: String(position) })}
              data-testid="catalog-name"
              value={draft.name}
              disabled={disabled}
              onChange={(event) => onChange({ name: event.target.value })}
              className="h-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={tUi('m_3daab7107c', { v0: String(position) })}
              data-testid="catalog-remove"
              disabled={disabled}
              onClick={onRemove}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label={tUi('m_d59192b9c8')}
              testId="catalog-sku"
              value={draft.sku}
              disabled={disabled}
              placeholder={tUi('m_0c6c4102d4')}
              onChange={(sku) => onChange({ sku })}
            />
            <Field
              label={tUi('m_3e8248e32e')}
              testId="catalog-price"
              value={draft.price}
              disabled={disabled}
              placeholder={tUi('catalogPricePlaceholder', {
                example: priceExample,
              })}
              onChange={(price) => onChange({ price })}
            />
            <Field
              label={tUi('m_ae6ca73ad5')}
              testId="catalog-url"
              value={draft.productUrl}
              disabled={disabled}
              placeholder={tUi('catalogUrlPlaceholder')}
              onChange={(productUrl) => onChange({ productUrl })}
            />
            <Field
              label={tUi('m_1bc3d368f8')}
              testId="catalog-variants"
              value={draft.variants}
              disabled={disabled}
              placeholder={tUi('m_fec16ea2bf')}
              onChange={(variants) => onChange({ variants })}
            />
          </div>
          {/* Never a silent zero: the text that was typed, beside the reason. */}
          {priceReading.ok ? null : (
            <p
              className="text-xs text-amber-700 dark:text-amber-500"
              data-testid="catalog-price-issue"
            >
              {tUi('m_9e232b3ca1')}
              {priceReading.raw}”. {tUi(priceReading.reason, { example: priceExample })}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function Field({
  label,
  testId,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const id = useId();
  return (
    <div className="text-xs text-muted-foreground">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-8"
      />
    </div>
  );
}

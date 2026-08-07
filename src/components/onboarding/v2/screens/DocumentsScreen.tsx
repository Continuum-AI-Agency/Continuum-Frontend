'use client';

import { FileText } from '@phosphor-icons/react';

import { DesignSystemCard } from '@/components/design-system/DesignSystemCard';
import { DocumentUploader } from '@/components/onboarding/shared/DocumentUploader';

import { HelpPopover } from '../HelpPopover';

type DocumentsScreenProps = {
  totalSteps: number;
  brandId?: string | null;
  /**
   * Raised while a design system is being read.
   *
   * The parent holds Continue for the duration. A design system is the single
   * highest-signal input we ever receive about a brand, and everything downstream —
   * the Brand DNA reveal, the creative prewarm, the first generations — is derived
   * from what we know at the moment it runs. Letting the wizard advance mid-parse
   * would produce a brand built from the website guess and then quietly contradicted
   * a few seconds later.
   */
  onDesignSystemBusyChange?: (busy: boolean) => void;
};

export function DocumentsScreen({
  totalSteps,
  brandId,
  onDesignSystemBusyChange,
}: DocumentsScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_22%,transparent)] bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_8%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--cs-violet,#5a39ff)]">
            <FileText className="h-3 w-3" />
            Step 2 of {totalSteps}
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-foreground md:text-[2.5rem]">
              Brand documents
            </h1>
            <HelpPopover label="What documents help?">
              <p className="font-semibold text-foreground">What documents help?</p>
              <p className="text-muted-foreground">
                Anything that captures your brand&apos;s voice or strategy: style guides, prior
                campaigns, taglines, decks, or product one-pagers. Continuum reads them to ground
                its analysis in your actual work.
              </p>
            </HelpPopover>
          </div>
          <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">
            Optional. Upload assets to ground your Brand DNA in real materials — or skip and let us
            infer from your website.
          </p>
        </div>

        {/* Above the document list on purpose: a design system outranks every other
            document a brand can give us, and burying it under a generic uploader is
            how the most valuable input on the page gets missed. */}
        {brandId ? (
          <DesignSystemCard
            brandId={brandId}
            variant="onboarding"
            onBusyChange={onDesignSystemBusyChange}
            className="mb-6"
          />
        ) : null}

        <DocumentUploader />
      </div>
    </div>
  );
}

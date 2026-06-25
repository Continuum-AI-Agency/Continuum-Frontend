import { FileText } from "@phosphor-icons/react";

import { DocumentUploader } from "@/components/onboarding/shared/DocumentUploader";

import { HelpPopover } from "../HelpPopover";

type DocumentsScreenProps = {
  totalSteps: number;
};

export function DocumentsScreen({ totalSteps }: DocumentsScreenProps) {
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
                Anything that captures your brand&apos;s voice or strategy:
                style guides, prior campaigns, taglines, decks, or product
                one-pagers. Continuum reads them to ground its analysis in your
                actual work.
              </p>
            </HelpPopover>
          </div>
          <p className="mx-auto mt-3 max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">
            Optional. Upload assets to ground your Brand DNA in real materials —
            or skip and let us infer from your website.
          </p>
        </div>

        <DocumentUploader />
      </div>
    </div>
  );
}

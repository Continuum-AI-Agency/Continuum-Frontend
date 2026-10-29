'use client';

import {
  type OnboardingIntake,
  onboardingIntakeSchema,
  onboardingSocialInputSchema,
} from '@continuum/contracts';
import {
  ArrowRight,
  CaretDown,
  CircleNotch,
  Files,
  Globe,
  Paperclip,
  TextAlignLeft,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { type ReactNode, useId, useRef, useState } from 'react';
import { FacebookIcon, InstagramIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { ACCEPTED_DOCUMENT_EXTENSIONS } from '@/lib/documents/uploadLimits';
import { type DetectedIntake, detectIntakeKind } from '@/lib/onboarding/detectIntakeKind';
import { resolveWebsiteDraftUrl } from '@/lib/onboarding/websiteDraft';
import { cn } from '@/lib/utils';

// One input instead of a source picker: paste a site or a social handle, drop brand files, or
// just describe the business. The kind is detected as the user types and shown as a chip they
// can override; the intake it produces is exactly what the four-radio form produced.

type Mode = 'website' | 'social' | 'description' | 'documents';

const MODE_OPTIONS: Array<{ mode: Mode; label: string; icon: ReactNode }> = [
  { mode: 'website', label: 'Website', icon: <Globe aria-hidden /> },
  { mode: 'social', label: 'Social profile', icon: <InstagramIcon aria-hidden /> },
  { mode: 'description', label: 'Description', icon: <TextAlignLeft aria-hidden /> },
  { mode: 'documents', label: 'Brand documents', icon: <Files aria-hidden /> },
];

const HELP: Record<Mode | 'empty', string> = {
  empty: 'Press Enter to analyze. Shift + Enter adds a new line.',
  website: 'We’ll read your site to understand your brand.',
  social: 'We’ll read your public Instagram profile or Facebook Page.',
  description: 'A few sentences is plenty: what you sell, and who it’s for.',
  documents: 'You’ll add a brand guide, deck, or product doc on the next step.',
};

function modeOf(detected: DetectedIntake | null): Mode | null {
  if (!detected) return null;
  if (detected.kind === 'website' || detected.kind === 'description') return detected.kind;
  return 'social';
}

type UrlScreenProps = {
  defaultUrl?: string | null;
  defaultIntake?: OnboardingIntake | null;
  defaultBrandName?: string;
  /** `files` are brand documents dropped here; the documents step uploads them. */
  onSubmit: (intake: OnboardingIntake, files?: File[]) => Promise<void> | void;
  error?: string | null;
  retrying?: boolean;
  onRetry?: () => void;
};

export function UrlScreen({
  defaultUrl,
  defaultIntake,
  defaultBrandName,
  onSubmit,
  error,
  retrying,
  onRetry,
}: UrlScreenProps) {
  const ids = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(
    defaultIntake?.kind === 'description'
      ? (defaultIntake.description ?? '')
      : (defaultIntake?.url ?? defaultIntake?.reference_url ?? defaultUrl ?? ''),
  );
  // An override applies to the text it was chosen for; editing the text re-detects.
  const [override, setOverride] = useState<Mode | null>(
    defaultIntake?.kind === 'documents' ? 'documents' : null,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [brandName, setBrandName] = useState(defaultIntake?.brand_name ?? defaultBrandName ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const detected = detectIntakeKind(text);
  const mode: Mode | null = files.length > 0 ? 'documents' : (override ?? modeOf(detected));
  const busy = Boolean(retrying) || submitting;
  const message = fieldError ?? error ?? null;
  const helpId = `${ids}-help`;
  const errorId = `${ids}-error`;

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFiles((current) => [...current, ...Array.from(list)]);
    setFieldError(null);
  };

  const describeInstead = () => {
    setOverride('description');
    setFiles([]);
    setText('');
    setFieldError(null);
    textareaRef.current?.focus();
  };

  const validate = (): string | null => {
    const value = text.trim();
    if (!mode) return 'Paste a link, add brand files, or describe your business.';
    if (mode !== 'website' && !brandName.trim()) return 'Enter your brand name.';
    if ((mode === 'website' || mode === 'social') && value.length > 2048)
      return 'That link is too long.';
    if (
      mode === 'website' &&
      (!resolveWebsiteDraftUrl(value) || onboardingSocialInputSchema.safeParse(value).success)
    )
      return 'Enter your website address, or describe your business instead.';
    if (mode === 'social' && !onboardingSocialInputSchema.safeParse(value).success)
      return 'Use an Instagram profile or a Facebook business Page link, not a post or group.';
    if (mode === 'description' && !value)
      return 'Tell us what your business does and who it serves.';
    if (mode === 'description' && value.length > 8000)
      return 'Keep your business description within 8,000 characters.';
    return null;
  };

  const submit = async () => {
    if (busy) return;
    const problem = validate();
    setFieldError(problem);
    if (problem || !mode) return;
    const value = text.trim();
    const social = mode === 'social' ? onboardingSocialInputSchema.parse(value) : null;
    const typedSocial = onboardingSocialInputSchema.safeParse(value);
    // A link the user gave before switching to documents or a description stays as context.
    const referenceUrl =
      mode === 'documents' || mode === 'description'
        ? (defaultIntake?.reference_url ??
          defaultIntake?.url ??
          (mode === 'documents'
            ? typedSocial.success
              ? typedSocial.data.url
              : resolveWebsiteDraftUrl(value)
            : null))
        : defaultIntake?.reference_url;
    const intake = onboardingIntakeSchema.parse({
      kind: social?.kind ?? mode,
      brand_name: brandName.trim() || defaultBrandName || 'My Brand',
      url: social?.url ?? (mode === 'website' ? resolveWebsiteDraftUrl(value) : null),
      description: mode === 'description' ? value : null,
      ...(referenceUrl ? { reference_url: referenceUrl } : {}),
    });
    setSubmitting(true);
    try {
      await onSubmit(intake, files.length > 0 ? files : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-xl">
        <h1 className="mb-3 text-balance text-center text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
          Start with your brand
        </h1>
        <p className="mx-auto mb-8 max-w-md text-balance text-center text-muted-foreground">
          Paste a link, drop in brand files, or describe what you do. You don’t need a website.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor={`${ids}-source`} className="sr-only">
            Website, social profile, or a description of your business
          </Label>
          <InputGroup
            data-testid="intake-composer"
            className={cn(
              'rounded-xl bg-card motion-safe:transition-[box-shadow,border-color]',
              dragActive && 'border-ring ring-[3px] ring-ring/45',
            )}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('Files')) return;
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDragActive(false);
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.files.length) return;
              event.preventDefault();
              setDragActive(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            {files.length > 0 ? (
              <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
                {files.map((file, index) => (
                  <span
                    key={`${file.name}:${file.size}:${file.lastModified}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 py-0.5 pr-1 pl-2.5 text-xs text-foreground"
                  >
                    <Files className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      disabled={busy}
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </InputGroupAddon>
            ) : null}
            <InputGroupTextarea
              ref={textareaRef}
              id={`${ids}-source`}
              value={text}
              rows={1}
              maxLength={8000}
              disabled={busy}
              placeholder={
                override === 'description'
                  ? 'What does your business do, and who is it for?'
                  : 'Paste your website or social handle, drop brand files, or describe your business'
              }
              className="max-h-60 min-h-14 px-4 text-base md:text-base"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={message ? errorId : helpId}
              onChange={(event) => {
                setText(event.target.value);
                setOverride((current) => (current === 'documents' ? current : null));
                setFieldError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                void submit();
              }}
            />
            <InputGroupAddon align="block-end" className="justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <InputGroupButton
                  size="icon-sm"
                  aria-label="Attach brand files"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-4" aria-hidden />
                </InputGroupButton>
                <SourceChip
                  mode={mode}
                  detected={detected}
                  fileCount={files.length}
                  disabled={busy}
                  onChoose={(next) => {
                    setOverride(next);
                    if (next !== 'documents') setFiles([]);
                    setFieldError(null);
                  }}
                />
              </div>
              <InputGroupButton
                type="submit"
                size="sm"
                variant="default"
                disabled={busy}
                aria-busy={busy}
                className="shrink-0"
              >
                {busy ? (
                  <>
                    <CircleNotch className="size-4 animate-spin motion-reduce:animate-none" />
                    Reading your source…
                  </>
                ) : (
                  <>
                    {mode === 'documents' ? 'Continue to documents' : 'Analyze my brand'}
                    <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_DOCUMENT_EXTENSIONS}
            className="hidden"
            tabIndex={-1}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
          />

          {mode && mode !== 'website' ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-brand-name`}>Brand name</Label>
              <Input
                id={`${ids}-brand-name`}
                value={brandName}
                onChange={(event) => {
                  setBrandName(event.target.value);
                  setFieldError(null);
                }}
                autoComplete="organization"
                disabled={busy}
                aria-invalid={fieldError === 'Enter your brand name.'}
              />
            </div>
          ) : null}

          {message ? (
            <div id={errorId} role="alert" className="flex gap-2.5 text-sm">
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-2">
                <p className="text-foreground">{message}</p>
                {error && !fieldError ? (
                  <div className="flex flex-wrap gap-2">
                    {onRetry ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        disabled={busy}
                      >
                        Try again
                      </Button>
                    ) : null}
                    {mode !== 'description' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={describeInstead}
                        disabled={busy}
                      >
                        Describe it instead
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p id={helpId} className="text-sm text-muted-foreground">
              {files.length > 0
                ? 'We’ll read these files on the next step.'
                : HELP[mode ?? 'empty']}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

function SourceChip({
  mode,
  detected,
  fileCount,
  disabled,
  onChoose,
}: {
  mode: Mode | null;
  detected: DetectedIntake | null;
  fileCount: number;
  disabled: boolean;
  onChoose: (mode: Mode) => void;
}) {
  const { icon, label, detail } = describeSource(mode, detected, fileCount);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            data-testid="intake-source-chip"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0"
          >
            {icon}
            <span className="text-foreground">{label}</span>
            {detail ? <span className="min-w-0 truncate">{detail}</span> : null}
            <CaretDown aria-hidden />
            <span className="sr-only">. Change source type</span>
          </button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-48">
        {MODE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.mode}
            onClick={() => onChoose(option.mode)}
            className="gap-2 [&_svg]:size-4"
          >
            {option.icon}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function describeSource(
  mode: Mode | null,
  detected: DetectedIntake | null,
  fileCount: number,
): { icon: ReactNode; label: string; detail: string | null } {
  if (mode === 'documents') {
    return {
      icon: <Files aria-hidden />,
      label: 'Brand documents',
      detail: fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : null,
    };
  }
  if (mode === 'website') {
    const host = detected?.kind === 'website' ? new URL(detected.url).hostname : null;
    return { icon: <Globe aria-hidden />, label: 'Website', detail: host };
  }
  if (mode === 'social') {
    if (detected?.kind === 'instagram') {
      const handle = new URL(detected.url).pathname.replaceAll('/', '');
      return { icon: <InstagramIcon aria-hidden />, label: 'Instagram', detail: `@${handle}` };
    }
    if (detected?.kind === 'facebook')
      return { icon: <FacebookIcon aria-hidden />, label: 'Facebook Page', detail: null };
    return { icon: <InstagramIcon aria-hidden />, label: 'Social profile', detail: null };
  }
  if (mode === 'description')
    return { icon: <TextAlignLeft aria-hidden />, label: 'Description', detail: null };
  return { icon: <Globe aria-hidden />, label: 'Detects as you type', detail: null };
}

'use client';

import {
  type OnboardingIntake,
  onboardingIntakeSchema,
  onboardingSocialInputSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { resolveWebsiteDraftUrl } from '@/lib/onboarding/websiteDraft';

const formSchema = z
  .object({
    mode: z.enum(['website', 'social', 'documents', 'description']),
    brandName: z.string().trim(),
    url: z.string().trim(),
    description: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.mode !== 'website' && !data.brandName) {
      ctx.addIssue({ code: 'custom', path: ['brandName'], message: 'Enter your brand name.' });
    }
    if (
      data.mode === 'website' &&
      (!resolveWebsiteDraftUrl(data.url) || onboardingSocialInputSchema.safeParse(data.url).success)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Enter your website URL, or choose Social profile.',
      });
    }
    if (data.mode === 'social' && !onboardingSocialInputSchema.safeParse(data.url).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Enter an Instagram profile or Facebook business Page URL.',
      });
    }
    if (data.mode === 'description' && !data.description) {
      ctx.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'Tell us what your business does and who it serves.',
      });
    }
    if (data.mode === 'description' && data.description.length > 8000)
      ctx.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'Keep your business description within 8,000 characters.',
      });
    if ((data.mode === 'website' || data.mode === 'social') && data.url.length > 2048)
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'That URL is too long.' });
  });

const OPTIONS = [
  ['website', 'Website'],
  ['social', 'Social profile'],
  ['documents', 'Brand documents'],
  ['description', 'Describe your business'],
] as const;

type UrlScreenProps = {
  defaultUrl?: string | null;
  defaultIntake?: OnboardingIntake | null;
  defaultBrandName?: string;
  onSubmit: (intake: OnboardingIntake) => Promise<void> | void;
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
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode:
        defaultIntake?.kind === 'instagram' || defaultIntake?.kind === 'facebook'
          ? 'social'
          : (defaultIntake?.kind ?? 'website'),
      brandName: defaultIntake?.brand_name ?? defaultBrandName ?? '',
      url: defaultIntake?.url ?? defaultIntake?.reference_url ?? defaultUrl ?? '',
      description: defaultIntake?.description ?? '',
    },
  });
  const mode = form.watch('mode');
  const fieldError =
    form.formState.errors.brandName?.message ||
    form.formState.errors.url?.message ||
    form.formState.errors.description?.message;
  const busy = retrying || form.formState.isSubmitting;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-xl">
        <h1 className="mb-3 text-balance text-center text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
          Start with your brand
        </h1>
        <p className="mb-8 text-center text-muted-foreground">
          Use what you already have. You don’t need a website to get started.
        </p>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (data) => {
            const social =
              data.mode === 'social' ? onboardingSocialInputSchema.parse(data.url) : null;
            const rememberedSocial = onboardingSocialInputSchema.safeParse(data.url);
            const referenceUrl =
              data.mode === 'documents' || data.mode === 'description'
                ? (defaultIntake?.reference_url ??
                  defaultIntake?.url ??
                  (rememberedSocial.success
                    ? rememberedSocial.data.url
                    : resolveWebsiteDraftUrl(data.url)))
                : defaultIntake?.reference_url;
            const intake = onboardingIntakeSchema.parse({
              kind: social?.kind ?? data.mode,
              brand_name: data.brandName || defaultBrandName || 'My Brand',
              url:
                social?.url ?? (data.mode === 'website' ? resolveWebsiteDraftUrl(data.url) : null),
              description: data.mode === 'description' ? data.description : null,
              ...(referenceUrl ? { reference_url: referenceUrl } : {}),
            });
            await onSubmit(intake);
          })}
        >
          <Controller
            control={form.control}
            name="mode"
            render={({ field }) => (
              <RadioGroup
                aria-label="Starting source"
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  form.clearErrors();
                }}
                className="grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {OPTIONS.map(([value, label]) => (
                  <div key={value} className="flex items-center gap-3">
                    <RadioGroupItem id={`source-${value}`} value={value} disabled={busy} />
                    <Label htmlFor={`source-${value}`} className="cursor-pointer py-2">
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          {mode !== 'website' ? (
            <div className="space-y-2">
              <Label htmlFor="onboarding-brand-name">Brand name</Label>
              <Input
                id="onboarding-brand-name"
                {...form.register('brandName')}
                autoComplete="organization"
                aria-invalid={Boolean(form.formState.errors.brandName)}
                aria-describedby={fieldError ? 'intake-error' : undefined}
              />
            </div>
          ) : null}
          {mode === 'website' || mode === 'social' ? (
            <div className="space-y-2">
              <Label htmlFor="onboarding-url">
                {mode === 'website' ? 'Website URL' : 'Social profile URL'}
              </Label>
              <Input
                id="onboarding-url"
                {...form.register('url')}
                placeholder={
                  mode === 'website'
                    ? 'yourdomain.com'
                    : 'instagram.com/yourbrand or facebook.com/yourpage'
                }
                aria-invalid={Boolean(form.formState.errors.url)}
                aria-describedby={fieldError ? 'intake-error' : 'source-help'}
              />
              <p id="source-help" className="text-sm text-muted-foreground">
                {mode === 'website'
                  ? 'We’ll read your website to understand your brand.'
                  : 'Instagram profiles and public Facebook business Pages. You can also use an Instagram @handle.'}
              </p>
            </div>
          ) : null}
          {mode === 'description' ? (
            <div className="space-y-2">
              <Label htmlFor="onboarding-description">What does your business do?</Label>
              <Textarea
                id="onboarding-description"
                {...form.register('description')}
                rows={5}
                placeholder="What you offer, who you serve, and what makes your brand different."
                aria-invalid={Boolean(form.formState.errors.description)}
                aria-describedby={fieldError ? 'intake-error' : undefined}
              />
            </div>
          ) : null}
          {mode === 'documents' ? (
            <p className="text-sm text-muted-foreground">
              Upload a brand guide, deck, or product document on the next step. We’ll wait until
              it’s readable before analyzing your brand.
            </p>
          ) : null}
          {fieldError || error ? (
            <div
              id="intake-error"
              role="alert"
              className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
            >
              <p>{fieldError || error}</p>
              {error && onRetry ? (
                <Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={busy}>
                  Try again
                </Button>
              ) : null}
              {error ? (
                <p className="mt-2">
                  You can choose Brand documents or Describe your business above.
                </p>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy
              ? 'Reading your source…'
              : mode === 'documents'
                ? 'Continue to documents'
                : 'Analyze my brand'}
          </Button>
        </form>
      </div>
    </div>
  );
}

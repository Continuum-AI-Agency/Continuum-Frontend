'use client';

import {
  type OnboardingIntake,
  onboardingIntakeSchema,
  onboardingSocialInputSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useValidationErrorMap } from '@/i18n/validation';
import { resolveWebsiteDraftUrl } from '@/lib/onboarding/websiteDraft';

function createFormSchema(tUi: ReturnType<typeof useTranslations<'onboarding'>>) {
  return z
    .object({
      mode: z.enum(['website', 'social', 'documents', 'description']),
      brandName: z.string().trim(),
      url: z.string().trim(),
      description: z.string().trim(),
    })
    .superRefine((data, ctx) => {
      if (data.mode !== 'website' && !data.brandName) {
        ctx.addIssue({ code: 'custom', path: ['brandName'], message: tUi('m_174c608886') });
      }
      if (
        data.mode === 'website' &&
        (!resolveWebsiteDraftUrl(data.url) ||
          onboardingSocialInputSchema.safeParse(data.url).success)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['url'],
          message: tUi('m_94af357618'),
        });
      }
      if (data.mode === 'social' && !onboardingSocialInputSchema.safeParse(data.url).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['url'],
          message: tUi('m_abb65d1b5e'),
        });
      }
      if (data.mode === 'description' && !data.description) {
        ctx.addIssue({
          code: 'custom',
          path: ['description'],
          message: tUi('m_763ec0d993'),
        });
      }
      if (data.mode === 'description' && data.description.length > 8000)
        ctx.addIssue({
          code: 'custom',
          path: ['description'],
          message: tUi('m_1bb1dfefec'),
        });
      if ((data.mode === 'website' || data.mode === 'social') && data.url.length > 2048)
        ctx.addIssue({ code: 'custom', path: ['url'], message: tUi('m_71462f997c') });
    });
}

function getSourceOptions(tUi: ReturnType<typeof useTranslations<'onboarding'>>) {
  return [
    ['website', tUi('m_2e8a57cc5c')],
    ['social', tUi('m_ab88a9270a')],
    ['documents', tUi('m_5552971562')],
    ['description', tUi('m_070ae0b478')],
  ] as const;
}

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
  const tUi = useTranslations('onboarding');
  const validationErrorMap = useValidationErrorMap();

  const OPTIONS = getSourceOptions(tUi);

  const formSchema = createFormSchema(tUi);

  const form = useForm<z.infer<ReturnType<typeof createFormSchema>>>({
    resolver: zodResolver(formSchema, { error: validationErrorMap }),
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
          {tUi('m_fa0801b70a')}
        </h1>
        <p className="mb-8 text-center text-muted-foreground">{tUi('m_65d91e8d33')}</p>
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
                aria-label={tUi('m_f22a87aaee')}
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
              <Label htmlFor="onboarding-brand-name">{tUi('m_6b4b8b5df0')}</Label>
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
                {mode === 'website' ? tUi('m_b32233ad82') : tUi('m_3ae09d3fa1')}
              </Label>
              <Input
                id="onboarding-url"
                {...form.register('url')}
                placeholder={mode === 'website' ? tUi('m_f61ea79122') : tUi('m_4c85f9c281')}
                aria-invalid={Boolean(form.formState.errors.url)}
                aria-describedby={fieldError ? 'intake-error' : 'source-help'}
              />
              <p id="source-help" className="text-sm text-muted-foreground">
                {mode === 'website' ? tUi('m_96356e381f') : tUi('m_d8b07c6406')}
              </p>
            </div>
          ) : null}
          {mode === 'description' ? (
            <div className="space-y-2">
              <Label htmlFor="onboarding-description">{tUi('m_73ab2e6783')}</Label>
              <Textarea
                id="onboarding-description"
                {...form.register('description')}
                rows={5}
                placeholder={tUi('m_b4f25859c3')}
                aria-invalid={Boolean(form.formState.errors.description)}
                aria-describedby={fieldError ? 'intake-error' : undefined}
              />
            </div>
          ) : null}
          {mode === 'documents' ? (
            <p className="text-sm text-muted-foreground">{tUi('m_f6a2ec65a0')}</p>
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
                  {tUi('m_042c862e44')}
                </Button>
              ) : null}
              {error ? <p className="mt-2">{tUi('m_af03bfe7b4')}</p> : null}
            </div>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy
              ? tUi('m_684d0f51f0')
              : mode === 'documents'
                ? tUi('m_dbdb94fca1')
                : tUi('m_604407d0dd')}
          </Button>
        </form>
      </div>
    </div>
  );
}

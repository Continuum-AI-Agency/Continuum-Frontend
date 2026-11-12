import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { type TemplateCheck, type TemplateChecksInput, templateChecks } from './templateChecks';

type ForgeText = ReturnType<typeof useTranslations<'forge'>>;
const STATE_KEYS = {
  created: 'waiting_to_start_f5e5f81f',
  analyzing: 'reading_your_file_e56b35f3',
  mapping: 'connecting_layers_697d8570',
  building: 'setting_up_dbdf27e5',
  validating: 'checking_0dfe1d63',
  draft_ready: 'draft_ready_aa51dbeb',
  needs_input: 'needs_your_answer_84ec74aa',
  smoking: 'test_rendering_ded513ec',
  review_ready: 'ready_to_review_ff2547b7',
  promoting: 'publishing_26c81739',
  published: 'published_2ef42ec2',
  failed: 'failed_031a8f0f',
} as const;

export function templateStateLabel(state: string, translate: ForgeText): string {
  return translate(STATE_KEYS[state as keyof typeof STATE_KEYS] ?? 'templateStateUnknown');
}

const COPY_KEYS = {
  parse: { name: 'read_your_file_ce9f3a54', what: 'we_open_your_after_effects_file_and_e3c337b4' },
  fonts: { name: 'fonts_3680fcad', what: 'we_check_we_have_every_font_your_te_8a7626b1' },
  build: { name: 'set_up_4da10f1f', what: 'we_turn_your_file_into_a_template_y_b05d27b1' },
  mapping: {
    name: 'connect_layers_9f331dfe',
    what: 'we_link_every_layer_you_can_change__e03b0398',
  },
  test: { name: 'test_render_a21b9c39', what: 'we_render_one_watermarked_frame_to__49737d9d' },
  publish: { name: 'publish_859390eb', what: 'we_make_the_template_available_to_r_76c7b034' },
} as const;

/** Present canonical check facts without translating source font names, IDs, or provider diagnostics. */
export function templateCheckPresentation(
  input: TemplateChecksInput,
  t: ForgeText,
  locale: UiLocale,
): TemplateCheck[] {
  const state = input.run?.state ?? input.forgeState ?? '';
  const result = (check: TemplateCheck): string => {
    switch (check.id) {
      case 'parse':
        return input.parseState === 'parsed'
          ? t('templateVariablesFound', {
              variables: input.variableCount,
              formats: input.formatCount,
            })
          : input.parseState === 'failed'
            ? t('templateParseFailed')
            : input.parseState === 'pending'
              ? t('not_opened_yet_22211927')
              : t('we_don_t_read_this_file_type_4456b528');
      case 'fonts': {
        const readiness = input.fontReadiness;
        if (input.parseState !== 'parsed' || (readiness && readiness.parseState !== 'parsed'))
          return t('waiting_for_your_file_to_be_read_0e9ea4dc');
        if (input.fontCheckFailed) return t('couldn_t_check_your_fonts_42d5c3b2');
        if (!readiness) return t('checking_your_fonts_5935c2e9');
        const missing = readiness.fonts.filter((font) => !font.held).map((font) => font.family);
        if (!readiness.fonts.length) return t('no_fonts_used_d273750e');
        return missing.length
          ? t('templateFontsMissing', {
              count: missing.length,
              total: readiness.fonts.length,
              fonts: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
                missing,
              ),
            })
          : t('templateFontsFound', { count: readiness.fonts.length });
      }
      case 'build': {
        if (state === 'failed') return t('templateSetupStopped');
        const needs = input.run?.needs ?? [];
        if (state === 'needs_input' && needs.length)
          return needs.every((need) => need.kind === 'asset')
            ? t('templateNeedsMedia', { count: needs.length })
            : t('templateLayersUnconnected', { count: needs.length });
        if (check.state === 'pass') return t('set_up_4da10f1f');
        if (check.state === 'todo') return t('not_set_up_yet_1a57d290');
        return templateStateLabel(state, t);
      }
      case 'mapping': {
        if (input.parseState !== 'parsed' || (!input.run && !input.templateKey))
          return t('available_once_setup_starts_5d33087e');
        if (input.mappingCheckFailed) return t('couldn_t_load_the_layer_check_e5e953b1');
        const review = input.mappingReview;
        if (!review) return t('checking_layers_33a0d16c');
        if (review.state === 'unavailable') return t('layer_check_isn_t_available_yet_295ea8df');
        if (review.state === 'needs_review')
          return t('templateMappingNeedsReview', {
            matched: review.matchedSlots,
            total: review.slotCount,
            count: review.unmatchedSlots.length,
          });
        return t('templateMappingResult', {
          matched: review.matchedSlots,
          total: review.slotCount,
          additional: review.fields.filter((field) => field.match === 'forge_only').length,
          identity: review.identityAvailable ? 'yes' : 'no',
        });
      }
      case 'test':
        return check.state === 'running'
          ? t('rendering_a_test_frame_0b9a187a')
          : check.state === 'pass'
            ? t('test_frame_rendered_d7829bb7')
            : t('not_run_yet_b9906c38');
      case 'publish': {
        if (input.templateKey) {
          const verification = input.publishVerification;
          if (verification)
            return verification.issues.length
              ? t('templatePublishedReview', { count: verification.issues.length })
              : t('templatePublishedChecked', { count: verification.media.length });
          return input.publishCheckFailed
            ? t('published_but_we_couldn_t_double_ch_f0d4319b')
            : t('published_checking_the_layout_7b5fa2a3');
        }
        return check.state === 'running'
          ? templateStateLabel('promoting', t)
          : t('not_published_yet_d785c25a');
      }
    }
  };
  return templateChecks(input).map((check) => {
    const keys = COPY_KEYS[check.id];
    const chips =
      check.id === 'build'
        ? [
            ...((input.run?.needs ?? []).filter((need) => need.kind !== 'asset').length
              ? [
                  {
                    label: t('templateUnboundCount', {
                      count: (input.run?.needs ?? []).filter((need) => need.kind !== 'asset')
                        .length,
                    }),
                    tone: 'warning' as const,
                  },
                ]
              : []),
            ...(input.run?.findings?.length
              ? [
                  {
                    label: t('templateIssueCount', { count: input.run.findings.length }),
                    tone: 'muted' as const,
                  },
                ]
              : []),
          ]
        : check.chips;
    return {
      ...check,
      name: t(keys.name),
      what: t(keys.what),
      result: result(check),
      ...(chips?.length ? { chips } : {}),
    };
  });
}

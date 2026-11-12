import {
  assembleCaption,
  matchPublishFormat,
  PLATFORM_CAPABILITIES,
  PUBLISH_PLATFORM_LABELS,
  type PublishPlan,
  type PublishPlanIssue,
  type PublishPlanNotice,
} from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type Translator = ReturnType<typeof useTranslations<'organic'>>;
type Issue = Pick<PublishPlanIssue, 'fix' | 'message'> & { reason: string };

/** Presentation only: the canonical resolver remains the sole authority for every gate and wire value. */
export function localizePublishIssue(
  issue: Issue,
  plan: PublishPlan,
  translate: Translator,
  locale: UiLocale,
): string {
  const platform = PUBLISH_PLATFORM_LABELS[plan.platform];
  const format = translate('publishFormatLabel', { format: plan.format });
  const carousel = PLATFORM_CAPABILITIES[plan.platform].carousel;
  const count = plan.media.length;
  switch (issue.reason) {
    case 'unsupported_format': {
      if (issue.fix === 'options')
        return translate('publishOptionsUnsupported', {
          platform,
          format,
          options: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
            plan.unsupportedOptions.map((option) => translate('publishOptionLabel', { option })),
          ),
        });
      if (issue.fix === 'media' && count > carousel.max)
        return translate('publishCarouselTooMany', {
          platform,
          count,
          maximum: carousel.max,
        });
      const videoIndex = plan.media.findIndex((item) => item.kind === 'video');
      if (issue.fix === 'media' && !carousel.videoSlides && videoIndex >= 0)
        return translate('publishCarouselVideo', {
          platform,
          number: videoIndex + 1,
        });
      return translate('publishFormatUnsupported', { platform, format });
    }
    case 'hyperframe_mp4_not_ready':
      return translate('publishHyperframePending');
    case 'media_missing': {
      if (plan.mediaPending === 'generating') return translate('publishMediaGenerating');
      if (plan.verb === 'reel')
        return translate(
          plan.platform === 'youtube' ? 'publishYoutubeVideo' : 'publishReelVideoMissing',
        );
      if (plan.verb === 'story') return translate('publishStoryMediaMissing');
      if (plan.verb === 'carousel')
        return plan.media.some((item) => !item.url && !item.storagePath)
          ? translate('publishCarouselSourceMissing')
          : translate('publishCarouselTooFew', {
              count,
              minimum: carousel.min,
            });
      return translate('publishPostImageMissing');
    }
    case 'caption_missing':
      return translate('publishCaptionMissing');
    case 'caption_too_long':
      return translate('publishCaptionTooLong', {
        platform,
        maximum: plan.caption.limit,
        count: assembleCaption(
          plan.caption.body,
          [...plan.caption.keptHashtags, ...plan.caption.droppedHashtags],
          {
            maxLength: Number.POSITIVE_INFINITY,
            maxHashtags: plan.caption.hashtagLimit,
          },
        ).text.length,
      });
    case 'account_missing':
      return translate(
        plan.account.status === 'needs_reauth'
          ? 'publishAccountReconnect'
          : plan.account.status === 'foreign'
            ? 'publishAccountForeign'
            : 'publishAccountRequired',
        { platform },
      );
    default:
      return translate('publishBlocked');
  }
}

export function localizePublishNotice(
  notice: PublishPlanNotice,
  plan: PublishPlan,
  translate: Translator,
): string {
  const platform = PUBLISH_PLATFORM_LABELS[plan.platform];
  switch (notice.code) {
    case 'hashtags_dropped':
      return translate('noticeHashtagsDropped', {
        count: plan.caption.droppedHashtags.length,
        platform,
        maximum: plan.caption.hashtagLimit,
        characters: plan.caption.limit,
        hashtags: plan.caption.droppedHashtags.join(' '),
      });
    case 'caption_not_sent':
      return translate('noticeCaptionNotSent');
    case 'media_not_sent':
      return translate(plan.verb === 'text' ? 'noticeTextOnly' : 'noticeMediaNotSent');
    case 'aspect_out_of_range':
      return translate('noticeAspectRange');
    case 'cover_platform_default':
      return translate('noticePlatformCover', { platform });
    case 'platform_defaults':
      return plan.platform === 'youtube'
        ? translate('noticeYoutubeDefaults', {
            hasTitle: plan.options.youtube?.title ? 'yes' : 'no',
            title: plan.options.youtube?.title ?? '',
          })
        : translate('noticeTiktokDefaults');
  }
}

export function organicPublishFormatLabel(value: string, translate: Translator): string {
  const format = matchPublishFormat(value);
  return format ? translate('publishFormatLabel', { format }) : value;
}

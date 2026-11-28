import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LOGIN_GLOW_GRADIENT } from '@/lib/ui/backgrounds';

// This was `new Date()`, which claimed the policy had been updated today, every
// day — wrong for a legal document, and unprerenderable. Bump it when the policy
// text below actually changes.
const LAST_UPDATED = '2026-09-30T12:00:00Z';

export default function PrivacyPage() {
  const uiText = useTranslations('public');
  const formatter = useFormatter();
  return (
    <div
      className="min-h-screen bg-default text-foreground"
      style={{ backgroundImage: LOGIN_GLOW_GRADIENT }}
    >
      {/* Header */}
      <div className="p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">{uiText('back_to_home_76c5505')}</span>
        </Link>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {/* Logo */}
        <div className="mb-8">
          <Image
            src="/logos/Continuum.png"
            alt="Continuum"
            width={180}
            height={48}
            priority
            className="h-12 w-auto"
          />
        </div>

        {/* Card */}
        <div className="glass-panel rounded-3xl p-12 shadow-2xl border-subtle">
          <h1 className="text-4xl font-bold text-foreground mb-2 tracking-tight">
            {uiText('privacy_policy_506ff39')}
          </h1>
          <p className="text-secondary text-sm mb-8">
            {uiText('legalUpdated', {
              date: formatter.dateTime(new Date(LAST_UPDATED), {
                dateStyle: 'long',
                timeZone: 'UTC',
              }),
            })}
          </p>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-8" />

          <div className="prose dark:prose-invert max-w-none text-secondary prose-headings:text-primary">
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('continuum_ai_us_we_or_our_operates_the_contin_b153c48')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('1_information_collection_and_use_2e3bc6a')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('we_collect_several_different_types_of_informa_4f24f36')}
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
              {uiText('types_of_data_collected_5b7cdc6')}
            </h3>
            <p className="text-secondary leading-relaxed mb-4">
              {uiText.rich('privacyPersonalData', {
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })}
            </p>
            <p className="text-secondary leading-relaxed mb-4">
              {uiText.rich('privacyUsageData', {
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })}
            </p>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText.rich('privacyTrackingData', {
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('2_use_of_data_41238cb')}
            </h2>
            <p className="text-secondary leading-relaxed mb-4">
              {uiText('continuum_ai_uses_the_collected_data_for_vari_766b9f7')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-secondary mb-6 ml-4">
              <li>{uiText('to_provide_and_maintain_the_service_685f3f6')}</li>
              <li>{uiText('to_notify_you_about_changes_to_our_service_fea02c9')}</li>
              <li>{uiText('to_allow_you_to_participate_in_interactive_fe_5250def')}</li>
              <li>{uiText('to_provide_customer_care_and_support_c002e18')}</li>
              <li>{uiText('to_provide_analysis_or_valuable_information_s_c382e43')}</li>
              <li>{uiText('to_monitor_the_usage_of_the_service_08449b5')}</li>
              <li>{uiText('to_detect_prevent_and_address_technical_issue_63da1f2')}</li>
            </ul>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('3_data_transfer_and_storage_add7eca')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('your_information_including_personal_data_may__4d59fff')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('4_disclosure_of_data_fc4ce08')}
            </h2>
            <p className="text-secondary leading-relaxed mb-4">
              {uiText('we_may_disclose_your_personal_data_in_the_goo_7356a67')}
            </p>
            <ul className="list-disc list-inside space-y-2 text-secondary mb-6 ml-4">
              <li>{uiText('to_comply_with_a_legal_obligation_bf5382e')}</li>
              <li>{uiText('to_protect_and_defend_the_rights_or_property__573e720')}</li>
              <li>{uiText('to_prevent_or_investigate_possible_wrongdoing_b7f3af6')}</li>
              <li>{uiText('to_protect_the_personal_safety_of_users_of_th_2102239')}</li>
              <li>{uiText('to_protect_against_legal_liability_1066ec5')}</li>
            </ul>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('5_data_security_28b7fb6')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('the_security_of_your_data_is_important_to_us__b8e0dc6')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('6_service_providers_a93e01f')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('we_may_employ_third_party_companies_and_indiv_7f6e2bb')}
            </p>
            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('7_your_data_protection_rights_143fe51')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('depending_on_your_location_you_may_have_the_f_1f860d6')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('8_children_s_privacy_020098c')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('our_service_is_not_intended_for_children_unde_f8dac25')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('9_changes_to_this_privacy_policy_5090df9')}
            </h2>
            <p className="text-secondary leading-relaxed mb-6">
              {uiText('we_may_update_our_privacy_policy_from_time_to_0bde408')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('10_contact_us_6ceee7b')}
            </h2>
            <p className="text-secondary leading-relaxed">
              {uiText.rich('privacyContact', {
                email: () => (
                  <a
                    href="mailto:privacy@continuum.ai"
                    className="underline transition-opacity hover:opacity-80"
                    style={{ color: 'var(--accent)' }}
                  >
                    privacy@continuum.ai
                  </a>
                ),
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LOGIN_GLOW_GRADIENT } from '@/lib/ui/backgrounds';

// This was `new Date()`, which claimed the terms had been updated today, every
// day — wrong for a legal document, and unprerenderable. Bump it when the terms
// text below actually changes.
const LAST_UPDATED = '2026-09-30T12:00:00Z';

export default function TermsPage() {
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
            {uiText('terms_of_service_4afa55b')}
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
            <p className="leading-relaxed mb-6">
              {uiText('please_read_these_terms_of_service_terms_term_933d08b')}
            </p>

            <p className="leading-relaxed mb-6">
              {uiText('our_service_is_not_intended_for_children_unde_a0f2235')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('1_accounts_58d41e6')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('when_you_create_an_account_with_us_you_must_p_6cf13c5')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('2_intellectual_property_f20bb21')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('the_service_and_its_original_content_features_4cc1bee')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('3_user_conduct_and_acceptable_use_0f0e23d')}
            </h2>
            <p className="leading-relaxed mb-4">
              {uiText('you_agree_not_to_use_the_service_to_0cc5c14')}
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>{uiText('violate_any_local_state_national_or_internati_d5a1f30')}</li>
              <li>{uiText('transmit_any_material_that_is_abusive_harassi_2441406')}</li>
              <li>{uiText('transmit_any_unsolicited_or_unauthorized_adve_00e14b5')}</li>
              <li>{uiText('knowingly_transmit_any_material_that_contains_c474bab')}</li>
            </ul>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('4_third_party_integrations_e3247fe')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('our_service_may_contain_links_to_third_party__1aed082')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('5_termination_2342657')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('we_may_terminate_or_suspend_your_account_imme_2067146')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('6_limitation_of_liability_7a28a80')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('in_no_event_shall_continuum_ai_nor_its_direct_ce73fce')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('7_disclaimer_5ee78ea')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('your_use_of_the_service_is_at_your_sole_risk__40d75e0')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('8_governing_law_bb2b06a')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('these_terms_shall_be_governed_and_construed_i_9cf816f')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('9_changes_e369ec3')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('we_reserve_the_right_at_our_sole_discretion_t_bd845f1')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('10_contact_us_6ceee7b')}
            </h2>
            <p className="leading-relaxed">
              {uiText.rich('termsContact', {
                email: () => (
                  <a
                    href="mailto:legal@continuum.ai"
                    className="underline transition-opacity hover:opacity-80"
                    style={{ color: 'var(--accent)' }}
                  >
                    legal@continuum.ai
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

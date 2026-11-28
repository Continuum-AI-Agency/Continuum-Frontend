import { ArrowLeft } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ContinuumWordmark } from '@/components/shared/ContinuumWordmark';
import { Link } from '@/i18n/navigation';
import styles from '@/lib/ui/nightSky.module.css';

// This was `new Date()`, which claimed the terms had been updated today, every
// day — wrong for a legal document, and unprerenderable. Bump it when the terms
// text below actually changes.
const LAST_UPDATED = '2026-11-27T12:00:00Z';

export default function TermsPage() {
  const uiText = useTranslations('public');
  const formatter = useFormatter();
  return (
    <div className={`${styles.sky} min-h-screen text-foreground`}>
      {/* Header */}
      <div className="p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[#f3efe6]/70 hover:text-[#f3efe6] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">{uiText('back_to_home_76c5505')}</span>
        </Link>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {/* Logo */}
        <div className="mb-8">
          <ContinuumWordmark onDark className="h-12 w-auto" />
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
              {uiText('3_your_content_1e7cda6')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('your_content_means_the_material_you_or_your_3a72275')}
            </p>
            <p className="leading-relaxed mb-6">
              {uiText('you_keep_all_rights_you_have_in_your_content_90a5ade')}
            </p>
            <p className="leading-relaxed mb-6">
              {uiText('you_confirm_that_you_have_all_rights_and_perm_610b335')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('4_data_use_and_product_improvement_55e7a7d')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('usage_data_means_information_about_how_the_s_ccb5109')}
            </p>
            <p className="leading-relaxed mb-4">
              {uiText('you_agree_that_continuum_ai_may_use_usage_dat_51df0c7')}
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>{uiText('operate_maintain_secure_and_support_the_servi_cb647fb')}</li>
              <li>{uiText('analyze_usage_performance_and_reliability_8559353')}</li>
              <li>{uiText('build_train_test_and_improve_our_products_fea_6dbb3eb')}</li>
              <li>{uiText('develop_new_products_and_services_f74d894')}</li>
            </ul>
            <p className="leading-relaxed mb-6">
              {uiText('aggregated_or_de_identified_means_data_combi_767fa3b')}
            </p>
            <p className="leading-relaxed mb-6">
              {uiText('data_we_receive_from_third_party_accounts_you_7763220')}
            </p>
            <p className="leading-relaxed mb-6">
              {uiText('we_will_not_sell_your_content_we_will_not_dis_388c061')}
            </p>
            <p className="leading-relaxed mb-6">
              {uiText('we_own_all_rights_in_aggregated_or_de_identif_836bce3')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('5_user_conduct_and_acceptable_use_2b7a0cf')}
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
              {uiText('6_third_party_integrations_e58b80b')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('our_service_may_contain_links_to_third_party__1aed082')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('7_termination_9b3dabd')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('we_may_terminate_or_suspend_your_account_imme_2067146')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('8_limitation_of_liability_a5eac72')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('in_no_event_shall_continuum_ai_nor_its_direct_ce73fce')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('9_disclaimer_a979e36')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('your_use_of_the_service_is_at_your_sole_risk__40d75e0')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('10_governing_law_c5e163e')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('these_terms_shall_be_governed_and_construed_i_9cf816f')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('11_changes_a7ac6b7')}
            </h2>
            <p className="leading-relaxed mb-6">
              {uiText('we_reserve_the_right_at_our_sole_discretion_t_bd845f1')}
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">
              {uiText('12_contact_us_0e66d2d')}
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

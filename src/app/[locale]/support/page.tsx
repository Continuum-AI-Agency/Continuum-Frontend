import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public');
  return { title: `${t('support_be91940')} | Continuum`, description: t('supportDescription') };
}

export default function SupportPage() {
  const uiText = useTranslations('public');
  return (
    <main className="min-h-screen bg-default text-foreground px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/" className="text-secondary underline">
          Continuum
        </Link>
        <h1 className="text-4xl font-bold">{uiText('support_be91940')}</h1>
        <p>
          {uiText.rich('supportContact', {
            email: () => (
              <a className="underline" href="mailto:product@trycontinuum.ai">
                product@trycontinuum.ai
              </a>
            ),
          })}
        </p>
        <p className="text-secondary">
          {uiText('include_the_action_you_tried_the_error_messag_42b833e')}
        </p>
        <h2 className="text-2xl font-semibold">{uiText('connecting_continuum_07e8aa5')}</h2>
        <p>{uiText('sign_in_with_your_continuum_account_and_choos_edf1491')}</p>
        <nav aria-label={uiText('policies_d3ad1f1')} className="flex gap-6 text-secondary">
          <Link className="underline" href="/privacy">
            {uiText('privacy_policy_ba445cf')}
          </Link>
          <Link className="underline" href="/terms">
            {uiText('terms_of_service_e69e061')}
          </Link>
        </nav>
      </div>
    </main>
  );
}

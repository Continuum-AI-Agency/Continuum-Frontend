import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function Unauthorized() {
  const uiText = useTranslations('common');
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6 text-6xl font-bold text-zinc-300 dark:text-zinc-700">401</div>
        <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {uiText('authentication_required_0fcfb12')}
        </h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          {uiText('please_log_in_to_access_this_page_43b299c')}
        </p>
        <Link href="/login" className={buttonVariants({ size: 'lg' })}>
          {uiText('go_to_login_b84cc33')}
        </Link>
      </div>
    </div>
  );
}

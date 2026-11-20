import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function Forbidden() {
  const uiText = useTranslations('common');
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6 text-6xl font-bold text-zinc-300 dark:text-zinc-700">403</div>
        <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {uiText('access_denied_cc11d41')}
        </h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          {uiText('you_do_not_have_permission_to_view_this_resou_be01438')}
        </p>
        <Link href="/dashboard" className={buttonVariants({ size: 'lg' })}>
          {uiText('back_to_dashboard_b59e0c1')}
        </Link>
      </div>
    </div>
  );
}

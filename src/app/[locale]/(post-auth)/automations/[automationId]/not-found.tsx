import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function AutomationWorkspaceNotFound() {
  const uiText = useTranslations('automations');
  return (
    <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-background p-6 text-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
      <h2 className="text-lg font-semibold text-foreground">
        {uiText('workflow_not_found_9da5ec4')}
      </h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {uiText('this_workflow_no_longer_exists_or_it_belongs__508388b')}
      </p>
      <Link href="/automations" className={buttonVariants()}>
        {uiText('back_to_automations_f345ab6')}
      </Link>
    </div>
  );
}

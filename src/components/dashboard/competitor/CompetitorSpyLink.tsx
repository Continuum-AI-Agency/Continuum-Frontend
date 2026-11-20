import { useTranslations } from 'next-intl';
import { ModuleShortcutLink } from '@/components/shared/ModuleShortcutLink';

// Shared "open the full Brand Spy workspace" affordance for the dashboard
// competitor panels. The dashboard tables are a teaser; the workspace is the
// full surface. Pass an href to deep-link a specific Brand Spy sub-view.
export function CompetitorSpyLink({ href = '/competitor-spy' }: { href?: string } = {}) {
  const uiText = useTranslations('dashboard');
  return <ModuleShortcutLink href={href} label={uiText('brand_spy_12a1578')} />;
}

import { useTranslations } from 'next-intl';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import type { GoalArtifactStatusView, GoalStatusView } from '@/lib/goals/models';
import { goalControlLabel } from './goalControlLabels';

type Status = GoalStatusView | GoalArtifactStatusView;

export function GoalStatusPill({ status }: { status: Status }) {
  const t = useTranslations('dashboard');
  const variant =
    status === 'accepted' || status === 'complete'
      ? 'success'
      : status === 'blocked' || status === 'needs_changes'
        ? 'warning'
        : status === 'active' || status === 'in_review'
          ? 'violet'
          : 'secondary';

  return (
    <Pill variant={variant}>
      {(status === 'active' || status === 'in_review') && <PillIndicator variant="info" pulse />}
      {goalControlLabel(status, t)}
    </Pill>
  );
}

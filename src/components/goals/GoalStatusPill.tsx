import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import type { GoalArtifactStatusView, GoalStatusView } from '@/lib/goals/models';

type Status = GoalStatusView | GoalArtifactStatusView;

const LABELS: Record<Status, string> = {
  draft: 'Draft',
  active: 'Active',
  blocked: 'Blocked',
  complete: 'Complete',
  archived: 'Archived',
  in_review: 'In review',
  needs_changes: 'Needs changes',
  accepted: 'Accepted',
  waived: 'Waived',
};

export function GoalStatusPill({ status }: { status: Status }) {
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
      {LABELS[status]}
    </Pill>
  );
}

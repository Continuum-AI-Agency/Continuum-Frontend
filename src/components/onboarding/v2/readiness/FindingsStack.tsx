import type { ReadinessFinding } from '@/lib/onboarding/agentClient';
import { FindingCallout } from './FindingCallout';

export function FindingsStack({ findings }: { findings: (ReadinessFinding | null)[] }) {
  const real = findings.filter((f): f is ReadinessFinding => f !== null);
  if (real.length === 0) return null;
  return (
    <div className="space-y-3 pt-1">
      {real.map((f) => (
        <FindingCallout key={f.dimension} finding={f} />
      ))}
    </div>
  );
}

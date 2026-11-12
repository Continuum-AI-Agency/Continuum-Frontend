import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { AgentPreviewBuckets } from '../state/agentPreview';

type Props = {
  audience: NonNullable<AgentPreviewBuckets['audience']>;
};

export function AudienceDetail({ audience }: Props) {
  const tUi = useTranslations('onboarding');

  const sections: { label: string; items?: string[] | null }[] = [
    { label: tUi('m_17e51bb179'), items: audience.demographics },
    { label: tUi('m_4c3a249a0f'), items: audience.psychographics },
    { label: tUi('m_65882c75a8'), items: audience.pain_points },
    { label: tUi('m_48d8c627be'), items: audience.goals },
    { label: tUi('m_5cb8cee8ec'), items: audience.buying_criteria },
    { label: tUi('m_3fc5473287'), items: audience.interests },
  ].filter((s) => s.items && s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="pt-1">
      <Separator className="mb-3" />
      <ScrollArea className="h-64">
        <div className="grid grid-cols-1 gap-3 pr-3 sm:grid-cols-2">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                {section.label}
              </p>
              <ul className="space-y-1 text-sm text-[#374151]">
                {(section.items ?? []).slice(0, 4).map((item, idx) => (
                  <li key={idx} className="leading-snug">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

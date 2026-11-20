import type { useTranslations } from 'next-intl';

type TemplateCopy = { id: string; name: string; description: string };
/** Translate canonical template chrome only. Draft names, definitions and prompts remain source data. */
export function automationTemplateDisplay<T extends TemplateCopy>(
  template: T,
  t: ReturnType<typeof useTranslations<'automations'>>,
): Pick<T, 'name' | 'description'> {
  if (template.id !== 'performance-pulse')
    return { name: template.name, description: template.description };
  return {
    name: template.name === 'Paid + organic performance pulse' ? t('m_84a726efeb') : template.name,
    description:
      template.description ===
      'Parallel paid and organic analysis synthesized into one stakeholder report.'
        ? t('m_2b26a6f8d0')
        : template.description,
  };
}

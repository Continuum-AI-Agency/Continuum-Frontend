import { defaultLocale, type UiLocale } from './config';

export function matchBrowserLocale(header?: string | null): UiLocale {
  const preferences = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const weight = quality ? Number(quality.trim().slice(2)) : 1;
      return { language: tag.toLowerCase().split('-')[0], weight };
    })
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight);
  for (const { language } of preferences) {
    if (language === 'pt') return 'pt-BR';
    if (language === 'es') return 'es';
    if (language === 'en') return 'en';
  }
  return defaultLocale;
}

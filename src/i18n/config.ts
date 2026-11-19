export const uiLocales = ['en', 'pt-BR', 'es'] as const;
export type UiLocale = (typeof uiLocales)[number];
export const defaultLocale: UiLocale = 'en';
export const localeCookieName = 'NEXT_LOCALE';

export function isUiLocale(value: unknown): value is UiLocale {
  return (uiLocales as readonly unknown[]).includes(value);
}

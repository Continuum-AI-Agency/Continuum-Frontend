export type ThemeAppearance = 'light' | 'dark';
export type ThemeMode = ThemeAppearance | 'system';

type ResolveAppearanceInput = {
  cookieAppearance?: string | null;
  storedMode?: string | null;
  prefersDark: boolean;
  defaultAppearance?: ThemeAppearance;
};

export function resolveThemeAppearance({
  cookieAppearance,
  storedMode,
  prefersDark,
  defaultAppearance,
}: ResolveAppearanceInput): ThemeAppearance {
  const fallbackAppearance = defaultAppearance ?? 'light';

  if (cookieAppearance === 'dark' || cookieAppearance === 'light') {
    return cookieAppearance;
  }

  if (storedMode === 'dark') return 'dark';
  if (storedMode === 'system') return prefersDark ? 'dark' : 'light';

  return fallbackAppearance;
}

export function readThemeAppearanceFromRoot(root: Element): ThemeAppearance | null {
  const dataTheme = root.getAttribute('data-theme');
  if (dataTheme === 'dark' || dataTheme === 'light') return dataTheme;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  return null;
}

export function applyThemeAppearanceToRoot(root: HTMLElement, appearance: ThemeAppearance) {
  root.setAttribute('data-theme', appearance);
  root.style.colorScheme = appearance;
  root.classList.remove(appearance === 'dark' ? 'light' : 'dark');
  root.classList.add(appearance);
}

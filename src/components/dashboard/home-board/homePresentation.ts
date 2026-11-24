export type HomePresentation = 'current' | 'dots';

export function resolveHomePresentation(
  value: string | string[] | undefined,
  environment: string | undefined,
): HomePresentation {
  return environment === 'development' && value === 'dots' ? 'dots' : 'current';
}

import { getApiBaseUrl } from './config';

export function getWsBaseUrl(): string {
  const base = getApiBaseUrl();
  return base.replace(/^http/, 'ws');
}

export function getWsUrl(path: string): string {
  const base = getWsBaseUrl();
  const trimmedPath = path.replace(/^\//, '');
  return `${base}/${trimmedPath}`;
}

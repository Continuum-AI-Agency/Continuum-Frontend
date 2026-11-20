import { isUiLocale } from './config';

export function externalPathname(pathname: string): string {
  const [, first, ...rest] = pathname.split('/');
  return isUiLocale(first) ? `/${rest.join('/')}` : pathname;
}

export function isLocalizedPage(pathname: string): boolean {
  const path = externalPathname(pathname);
  if (path === '/api' || path.startsWith('/api/')) return false;
  return !/^\/(?:auth\/(?:callback|confirm)|oauth\/(?:callback|start)|invite\/callback|callback|share\/[^/]+\/(?:events|download|download-all))\/?$/.test(
    path,
  );
}

const LOCAL_STORAGE_PROXY_HOSTS = new Set(['kong', 'host.docker.internal']);

function isLocalBrowserHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Local Supabase can mint Storage URLs with its Docker-only `kong:8000`
 * origin. Replace that origin with the public local API origin before a signed
 * URL crosses into browser-rendered data. Production and CDN origins are left
 * byte-for-byte untouched.
 */
export function toBrowserReachableStorageUrl(
  signedUrl: string,
  publicSupabaseUrl?: string,
): string {
  if (!publicSupabaseUrl) return signedUrl;

  try {
    const signed = new URL(signedUrl);
    const publicUrl = new URL(publicSupabaseUrl);
    const internalProxy =
      LOCAL_STORAGE_PROXY_HOSTS.has(signed.hostname) ||
      signed.hostname.startsWith('supabase_kong_');

    if (!internalProxy || !isLocalBrowserHost(publicUrl.hostname)) return signedUrl;
    signed.protocol = publicUrl.protocol;
    signed.host = publicUrl.host;
    return signed.toString();
  } catch {
    return signedUrl;
  }
}

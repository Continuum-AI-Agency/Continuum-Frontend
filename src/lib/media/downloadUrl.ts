// The HTML `download` attribute is ignored on cross-origin hrefs, and every
// asset href here is a cross-origin Supabase Storage signed URL — the browser
// navigates instead of saving. Supabase Storage honours a `download=<name>`
// query param by replying with `Content-Disposition: attachment`, so the save
// has to be requested on the URL rather than on the anchor.

const HTTP_URL = /^https?:\/\//i;
const HAS_DOWNLOAD_PARAM = /[?&]download(=|&|$)/;

export const withForcedDownload = (url: string, fileName: string): string => {
  if (!HTTP_URL.test(url) || HAS_DOWNLOAD_PARAM.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}download=${encodeURIComponent(fileName)}`;
};

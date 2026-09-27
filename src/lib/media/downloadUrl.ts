// The HTML `download` attribute is ignored on cross-origin hrefs, and every
// asset href here is a cross-origin Supabase Storage signed URL — the browser
// navigates instead of saving. Supabase Storage honours a `download=<name>`
// query param by replying with `Content-Disposition: attachment`, so the save
// has to be requested on the URL rather than on the anchor.

const HTTP_URL = /^https?:\/\//i;
const HAS_DOWNLOAD_PARAM = /[?&]download(=|&|$)/;

// A GCS V4 URL refuses any query param it was not signed with; its disposition is signed in.
const GCS_SIGNED_URL = /^https:\/\/storage\.googleapis\.com\//i;

export const withForcedDownload = (url: string, fileName: string): string => {
  if (!HTTP_URL.test(url) || HAS_DOWNLOAD_PARAM.test(url) || GCS_SIGNED_URL.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}download=${encodeURIComponent(fileName)}`;
};

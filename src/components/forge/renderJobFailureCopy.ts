// Why a render failed, in words. The backend writes `job.error` as a sentence a person can read;
// jobs from before that carry the bare literal `render_error` for every fleet failure, which is the
// one code worded here. Everything else is the backend's own sentence, shown whole.

const LEGACY_RENDER_ERROR = 'The render farm reported an error and sent no file.';

/** Null when the job carries no error. */
export function describeRenderJobFailure(error: string | null | undefined): string | null {
  const said = error?.trim();
  if (!said) return null;
  return said === 'render_error' ? LEGACY_RENDER_ERROR : said;
}

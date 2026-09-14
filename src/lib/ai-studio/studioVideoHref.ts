export type StudioVideoOrigin = 'canvas' | 'library';
export type StudioVideoView = 'assembly' | 'motion';

export function studioVideoHref(input: {
  projectId: string;
  origin: StudioVideoOrigin;
  view?: StudioVideoView;
}): string {
  const params = new URLSearchParams({ origin: input.origin });
  if (input.view) params.set('view', input.view);
  return `/studio/video/${input.projectId}?${params.toString()}`;
}

export function parseStudioVideoView(value: string | undefined): StudioVideoView | undefined {
  if (value === 'assembly' || value === 'motion') return value;
  return undefined;
}

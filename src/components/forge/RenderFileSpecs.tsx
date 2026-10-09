'use client';

import type { ApiRenderFileSpecs, ApiRenderOutput } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

function audioText(streams: NonNullable<ApiRenderFileSpecs['audioStreams']>): string {
  if (!streams.length) return 'No audio';
  const first = streams[0]!;
  if (
    streams.every(
      (stream) =>
        stream.channels === first.channels &&
        stream.codec === first.codec &&
        stream.sampleRate === first.sampleRate &&
        stream.bitDepth === first.bitDepth,
    )
  ) {
    return `${streams.length} ${streams.length === 1 ? 'track' : 'tracks'} × ${first.channels ?? '?'} ${first.channels === 1 ? 'channel' : 'channels'} · ${first.codec ?? 'unknown codec'} · ${first.sampleRate ? `${first.sampleRate / 1000} kHz` : 'unknown sample rate'} · ${first.bitDepth ? `${first.bitDepth}-bit` : 'unknown bit depth'}`;
  }
  return streams
    .map(
      (stream) =>
        `Track ${stream.index}: ${stream.channels ?? '?'} ch · ${stream.codec ?? 'unknown codec'} · ${stream.sampleRate ? `${stream.sampleRate / 1000} kHz` : 'unknown rate'} · ${stream.bitDepth ? `${stream.bitDepth}-bit` : 'unknown bit depth'}`,
    )
    .join('; ');
}

export function RenderFileSpecs({
  brandId,
  jobId,
  output,
}: {
  brandId: string;
  jobId: string;
  output: ApiRenderOutput;
}) {
  const query = useQuery({
    queryKey: ['forge', brandId, 'file-specs', jobId, output.id, output.url],
    queryFn: () => apiRendersApi.getFileSpecs(brandId, jobId, output.id),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const unavailable = query.isError || query.data?.status === 'unavailable';
  const video = query.data?.video;
  return (
    <div className="break-words text-xs text-muted-foreground" aria-live="polite">
      <span className="font-medium">{output.fileName}</span>
      {query.isPending ? (
        <span> · Inspecting file…</span>
      ) : unavailable ? (
        <span>
          {' '}
          · Specs unavailable.{' '}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-1 py-0 text-xs"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label={`Retry specs for ${output.fileName}`}
          >
            Retry
          </Button>
        </span>
      ) : (
        <span>
          {' · '}
          {video?.codec ?? 'Unknown video codec'}
          {video?.profile ? ` ${video.profile}` : ''}
          {' · '}
          {video?.frameRate ? `${Number(video.frameRate.toFixed(3))} fps` : 'Unknown fps'}
          {' · '}
          {video?.bitDepth ? `${video.bitDepth}-bit video` : 'Unknown video bit depth'}
          {' · '}
          {query.data?.audioStreams ? audioText(query.data.audioStreams) : 'Unknown audio'}
        </span>
      )}
    </div>
  );
}

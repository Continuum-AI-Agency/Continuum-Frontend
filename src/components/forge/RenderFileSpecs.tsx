'use client';

import type { ApiRenderFileSpecs, ApiRenderOutput } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  type useTranslations,
  useLocale as useUiLocale,
  useTranslations as useUiTranslations,
} from 'next-intl';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

function audioText(
  streams: NonNullable<ApiRenderFileSpecs['audioStreams']>,
  translate: ReturnType<typeof useTranslations<'forge'>>,
  number: Intl.NumberFormat,
): string {
  if (!streams.length) return translate('audioNoTracks');
  const details = (stream: (typeof streams)[number]) =>
    [
      translate('audioChannelCount', { count: stream.channels ?? 0 }),
      stream.codec ?? translate('audioUnknownCodec'),
      stream.sampleRate
        ? number.format(stream.sampleRate / 1000) + ' kHz'
        : translate('audioUnknownRate'),
      stream.bitDepth ? number.format(stream.bitDepth) + '-bit' : translate('audioUnknownDepth'),
    ].join(' · ');
  const first = streams[0]!;
  if (
    streams.every(
      (stream) =>
        stream.channels === first.channels &&
        stream.codec === first.codec &&
        stream.sampleRate === first.sampleRate &&
        stream.bitDepth === first.bitDepth,
    )
  )
    return translate('audioTrackCount', { count: streams.length }) + ' × ' + details(first);
  return streams
    .map((stream) =>
      translate('audioTrackDetails', { index: stream.index, details: details(stream) }),
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
  const decimalLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');
  const number = useMemo(
    () => new Intl.NumberFormat(decimalLocale, { maximumFractionDigits: 3, useGrouping: false }),
    [decimalLocale],
  );

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
        <span> {translateUi('inspecting_file_bf62ef14')}</span>
      ) : unavailable ? (
        <span>
          {' '}
          {translateUi('specs_unavailable_a62e6eff')}{' '}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-1 py-0 text-xs"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label={translateUi('retry_specs_for_value0_378df11c', {
              value0: String(output.fileName),
            })}
          >
            {' '}
            {translateUi('retry_942087cc')}{' '}
          </Button>
        </span>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          <p className="m-0">
            <span className="font-medium">{translateUi('video_07d70633')} </span>
            {video?.codec ?? translateUi('unknown_video_codec_b65afce2')}
            {video?.profile ? ` ${video.profile}` : ''}
            {' · '}
            {video?.frameRate
              ? `${number.format(Number(video.frameRate.toFixed(3)))} fps`
              : translateUi('unknown_fps_21b83cf3')}
            {' · '}
            {video?.fieldOrder === 'progressive'
              ? translateUi('progressive_c21bea0c')
              : video?.fieldOrder && video.fieldOrder !== 'unknown'
                ? translateUi('interlaced_12650423')
                : translateUi('unknown_scan_type_68618bfc')}
            {' · '}
            {video?.bitDepth
              ? translateUi('value0_bit_video_8b5b0966', { value0: String(video.bitDepth) })
              : translateUi('unknown_video_bit_depth_93dd92bd')}
          </p>
          <p className="m-0">
            <span className="font-medium">{translateUi('audio_8a2b9bff')} </span>
            {query.data?.audioStreams
              ? audioText(query.data.audioStreams, translateUi, number)
              : translateUi('unknown_audio_5560ef84')}
          </p>
          <p className="m-0 text-muted-foreground">
            {translateUi('measured_from_the_delivered_file_6a706218')}
          </p>
        </div>
      )}
    </div>
  );
}

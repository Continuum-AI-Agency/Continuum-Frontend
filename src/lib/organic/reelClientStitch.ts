import type { ClipWord, ReelClip } from '@continuum/contracts';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { attachVideoPoster } from '@/lib/library/videoPoster';
import { runSpliceInWorker, runTimelineInWorker } from '@/StudioCanvas/workers/spliceWorkerClient';
import type {
  TimelineWorkerItem,
  WorkerClipInput,
} from '@/StudioCanvas/workers/spliceWorkerProtocol';

import { transcribeReelTimeline } from './reelCaptions';
import { blobToBase64, finalizeReelMp4 } from './reelMp4';

export type StitchAndFinalizeReelParams = {
  brandId: string;
  draftId: string;
  clips: ReelClip[];
  durationSec: number;
  captions?: {
    enabled: boolean;
    sourceAssetId?: string;
    referenceAssetIds?: string[];
  };
  signal?: AbortSignal;
  onStage?: (label: string) => void;
};

export type StitchAndFinalizeReelResult = {
  bucket: string;
  path: string;
  signedUrl: string | null;
  durationSec: number;
  assetId: string;
};

async function downloadClip(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Failed to download scene clip (${response.status})`);
  return response.blob();
}

/**
 * Download the verified scene clips, stitch them into one MP4 in the splice
 * worker (mediabunny), and persist + link the result via `link-reel-mp4`. The
 * worker's object URL is revoked once the bytes are uploaded. A single-scene
 * reel is passed through unstitched (the splice worker requires >=2 clips).
 */
export async function stitchAndFinalizeReel(
  params: StitchAndFinalizeReelParams,
): Promise<StitchAndFinalizeReelResult> {
  const { brandId, draftId, clips, durationSec, captions, signal, onStage } = params;
  const ordered = [...clips].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) throw new Error('No scene clips to finalize');

  if (captions?.enabled && !captions.sourceAssetId) {
    throw new Error('Captioned UGC rendering requires a durable source clip asset.');
  }

  const blobs = await Promise.all(ordered.map((clip) => downloadClip(clip.signedClipUrl, signal)));
  const workerClips: WorkerClipInput[] = ordered.map((clip, i) => ({
    slotId: String(clip.index),
    blob: blobs[i],
  }));
  const timelineItems: TimelineWorkerItem[] = ordered.map((clip, index) => ({
    itemId: String(clip.index),
    kind: 'video',
    blob: blobs[index],
  }));
  let captionWords: ClipWord[] | undefined;
  let rendered:
    | Awaited<ReturnType<typeof runTimelineInWorker>>
    | Awaited<ReturnType<typeof runSpliceInWorker>>
    | undefined;
  try {
    let outputBlob: Blob;
    let outputDurationSec: number;
    if (captions?.enabled) {
      captionWords = await transcribeReelTimeline({
        brandId,
        sourceAssetId: captions.sourceAssetId as string,
        items: timelineItems,
        signal,
        onStage,
      });
      onStage?.('Burning captions…');
      rendered = await runTimelineInWorker({
        items: timelineItems,
        targetWidth: 720,
        targetHeight: 1280,
        captionWords,
        captionStyle: DEFAULT_CAPTION_STYLE,
        signal,
      });
      outputBlob = rendered.blob;
      outputDurationSec = rendered.durationSec;
    } else if (ordered.length === 1) {
      outputBlob = blobs[0];
      outputDurationSec = ordered[0].durationSec;
    } else {
      onStage?.('Stitching reel…');
      rendered = await runSpliceInWorker({ clips: workerClips, signal });
      outputBlob = rendered.blob;
      outputDurationSec = rendered.durationSec;
    }

    onStage?.('Finalizing…');
    const mp4Base64 = await blobToBase64(outputBlob);
    const linked = await finalizeReelMp4({
      brandId,
      draftId,
      mp4Base64,
      durationSec: outputDurationSec || durationSec,
      captions: captionWords
        ? {
            source: 'google_stt_v2',
            words: captionWords,
            style: DEFAULT_CAPTION_STYLE,
          }
        : undefined,
      referenceAssetIds: captions?.referenceAssetIds,
    });

    // This is the only place holding BOTH the finished blob and its asset id, which
    // is why the poster is made here rather than in the executor or on the server —
    // there is no server-side decode path at all.
    //
    // It matters beyond thumbnails: a Meta VIDEO ad creative requires an `image_hash`
    // poster alongside its `video_id`, so without this a stitched reel can never
    // become a paid ad. `attachVideoPoster` also backfills width/height/duration_ms,
    // which `buildVideoAssetRow` writes as null.
    //
    // Deliberately AFTER the upload and fail-soft (both helpers return null rather
    // than throwing): the MP4 is already durable at this point, and a poster failure
    // must never fail a render the user has already paid the encode time for.
    onStage?.('Making a poster…');
    await attachVideoPoster({
      file: outputBlob,
      mimeType: 'video/mp4',
      brandId,
      assetId: linked.assetId,
    }).catch(() => null);

    return {
      bucket: linked.bucket,
      path: linked.path,
      signedUrl: linked.signedUrl,
      durationSec: outputDurationSec || durationSec,
      assetId: linked.assetId,
    };
  } finally {
    if (rendered?.objectUrl.startsWith('blob:')) URL.revokeObjectURL(rendered.objectUrl);
  }
}

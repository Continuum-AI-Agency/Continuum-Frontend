'use client';

import type { TemplateAuthoringCommand, TemplateAuthoringNode } from '@continuum/contracts';
import { ChevronDown, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';
import {
  type AuthoringMotionChannel,
  channelLockReason,
  keyframeCommandFrames,
  motionEaseAxisLabel,
  motionEaseDimensions,
  moveMotionKeyframe,
  sampleMotionChannel,
  snapMotionTime,
} from './templateAuthoringMotion';
import { useForgePresentationText } from './useForgePresentationText';

type KeyframeCommand = Extract<TemplateAuthoringCommand, { type: 'layer.keyframes.replace' }>;
type CommandFrame = KeyframeCommand['keyframes'][number];
type Interpolation = CommandFrame['inInterpolation'];

const LABELS: Record<AuthoringMotionChannel['channel'], string> = {
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
};
const AXES = ['X', 'Y', 'Z'];
const timeLabel = (seconds: number, locale: UiLocale) => `${formatDecimal(seconds, 3, locale)} s`;

function friendlyLockReason(reason: string): string {
  const key = reason.toLowerCase();
  if (key.includes('generated_group_timing_unsupported'))
    return 'Group timing stays locked because its parent layer does not trim child layers.';
  if (key.includes('expression'))
    return 'Expression-driven motion is preserved and cannot be edited here.';
  if (key.includes('roving')) return 'Roving keyframes are preserved and cannot be edited here.';
  if (key.includes('tangent') || key.includes('continuity') || key.includes('auto_bezier'))
    return 'This motion uses spatial or automatic easing that is not editable in this timeline.';
  if (key.includes('separated'))
    return 'Separated motion channels are preserved and remain locked.';
  if (key.includes('3d'))
    return '3D motion is preserved; this timeline edits verified 2D motion only.';
  if (key.includes('pending') || key.includes('unavailable'))
    return 'Native motion details are still being verified.';
  return 'This channel is preserved and locked until its native motion can be verified.';
}

function startingValue(channel: AuthoringMotionChannel): number | [number, number, number] | null {
  const value = channel.baseValue;
  if (channel.channel === 'position' || channel.channel === 'scale') {
    return Array.isArray(value) && value.length === 3 ? [value[0]!, value[1]!, value[2]!] : null;
  }
  return typeof value === 'number' ? value : null;
}

function isNativeVector3(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Number.isFinite(value[2])
  );
}

function compositionFrameCount(durationSec: number, frameRate: number): number {
  return Math.max(1, Math.ceil(durationSec * frameRate - 1e-9));
}

export function TemplateLayerTimeline({
  node,
  durationSec,
  compositionFrameRate,
  playheadSec,
  onPlayheadChange,
  disabled,
  onCommand,
  compact = false,
  groupMotionVerified = false,
  onMotionOpenChange,
}: {
  compact?: boolean;
  groupMotionVerified?: boolean;
  onMotionOpenChange?: (open: boolean) => void;
  node: TemplateAuthoringNode | null;
  durationSec: number | null;
  compositionFrameRate: number | null;
  playheadSec: number;
  onPlayheadChange: (seconds: number) => void;
  disabled: boolean;
  onCommand: (command: TemplateAuthoringCommand) => void;
}) {
  const translateUi = useUiTranslations('forge');
  const displayLocale = useUiLocale();
  const presentForge = useForgePresentationText();

  const controlId = useId();
  const [motionOpen, setMotionOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [inDraft, setInDraft] = useState('');
  const [outDraft, setOutDraft] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState('');
  const [keyframeTimeDraft, setKeyframeTimeDraft] = useState('');
  const [dragPreview, setDragPreview] = useState<{
    keyframeId: string;
    timeSec: number;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const keyframeTimeDraftRef = useRef('');
  const lastCommittedKeyframeTimeRef = useRef<{
    nodeId: string;
    channelId: string;
    keyframeId: string;
    timeSec: number;
  } | null>(null);
  const playheadRef = useRef(playheadSec);
  const playheadChangeRef = useRef(onPlayheadChange);
  const keyframeTrackRef = useRef<HTMLDivElement>(null);
  const keyframeDragRef = useRef<{
    keyframeId: string;
    pointerId: number;
    startX: number;
    trackLeft: number;
    trackWidth: number;
    startTimeSec: number;
    durationSec: number;
    frameRate: number;
    frameDelta: number;
  } | null>(null);
  const suppressKeyframeClickRef = useRef(false);
  playheadRef.current = playheadSec;
  playheadChangeRef.current = onPlayheadChange;
  const frameRate = compositionFrameRate;
  const hasClock = durationSec !== null && durationSec > 0 && frameRate !== null && frameRate > 0;
  const groupMotionAllowed = node?.kind !== 'group' || groupMotionVerified;
  const channels = node?.keyframeChannels ?? [];
  const channelsWithLocks = useMemo(
    () =>
      channels.map((channel) => ({
        channel,
        lockReason: channelLockReason(channel),
      })),
    [channels],
  );
  const selectedChannel =
    channels.find((channel) => channel.channelId === selectedChannelId) ??
    channelsWithLocks.find(({ lockReason }) => lockReason === null)?.channel ??
    channels[0] ??
    null;
  const selectedFrames = selectedChannel ? keyframeCommandFrames(selectedChannel) : [];
  const selectedFrame =
    selectedFrames.find((frame) => frame.keyframeId === selectedFrameId) ??
    selectedFrames[0] ??
    null;
  const timingEnabled =
    !!node &&
    node.kind !== 'group' &&
    groupMotionAllowed &&
    (node.sourceRef !== null || node.nodeId.startsWith('draft:')) &&
    node.capabilities.timing &&
    node.timingReason === null &&
    hasClock &&
    durationSec !== null;
  const activeChannelEnabled =
    !!selectedChannel &&
    groupMotionAllowed &&
    (node?.kind !== 'group' ||
      selectedChannel.channel === 'position' ||
      selectedChannel.channel === 'scale' ||
      selectedChannel.channel === 'rotation') &&
    channelLockReason(selectedChannel) === null &&
    !!node?.capabilities.keyframes;
  const hasVerifiedStartValue = selectedChannel ? startingValue(selectedChannel) !== null : false;
  const activeSample = selectedChannel ? sampleMotionChannel(selectedChannel, playheadSec) : null;
  const totalFrames =
    frameRate && durationSec != null && durationSec > 0
      ? compositionFrameCount(durationSec, frameRate)
      : null;
  const currentFrameIndex = frameRate ? Math.round(playheadSec * frameRate) : null;
  const currentFrame =
    currentFrameIndex !== null && totalFrames !== null && currentFrameIndex >= totalFrames
      ? null
      : currentFrameIndex === null
        ? null
        : currentFrameIndex + 1;

  useEffect(() => {
    setPlaying(false);
    setStatus(null);
  }, [node?.nodeId]);
  useEffect(() => {
    setInDraft(node?.inSec == null ? '' : String(node.inSec));
    setOutDraft(node?.outSec == null ? '' : String(node.outSec));
  }, [node?.nodeId, node?.inSec, node?.outSec]);
  useEffect(() => {
    if (!channels.some((channel) => channel.channelId === selectedChannelId)) {
      setSelectedChannelId(
        channelsWithLocks.find(({ lockReason }) => lockReason === null)?.channel.channelId ??
          channels[0]?.channelId ??
          '',
      );
      setSelectedFrameId('');
    }
  }, [channels, channelsWithLocks, selectedChannelId]);
  useEffect(() => {
    if (!selectedFrames.some((frame) => frame.keyframeId === selectedFrameId))
      setSelectedFrameId(selectedFrames[0]?.keyframeId ?? '');
  }, [selectedFrames, selectedFrameId]);
  useEffect(() => {
    const draft = selectedFrame ? String(selectedFrame.timeSec) : '';
    keyframeTimeDraftRef.current = draft;
    setKeyframeTimeDraft(draft);
  }, [selectedFrame?.keyframeId, selectedFrame?.timeSec]);
  useEffect(() => {
    if (!playing || !hasClock || !durationSec || !frameRate) return;
    const frameCount = compositionFrameCount(durationSec, frameRate);
    const startFrame = Math.round(playheadRef.current * frameRate) % frameCount;
    const startTimeMs = performance.now();
    let lastFrame = startFrame;
    let animationFrame = 0;
    const tick = (nowMs: number) => {
      const elapsedFrames = Math.floor((Math.max(0, nowMs - startTimeMs) * frameRate) / 1_000);
      const frame = (startFrame + elapsedFrames) % frameCount;
      if (frame !== lastFrame) {
        lastFrame = frame;
        playheadChangeRef.current(frame / frameRate);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [playing, hasClock, durationSec, frameRate, node?.nodeId]);

  const replaceFrames = (frames: CommandFrame[]) => {
    if (!selectedChannel || !node || !activeChannelEnabled || disabled) return;
    onCommand({
      type: 'layer.keyframes.replace',
      nodeId: node.nodeId,
      channelId: selectedChannel.channelId,
      channel: selectedChannel.channel,
      keyframes: frames,
    });
  };

  const commitTiming = () => {
    if (!node || !timingEnabled || disabled) return;
    const inSec = Number(inDraft);
    const outSec = Number(outDraft);
    if (
      !Number.isFinite(inSec) ||
      !Number.isFinite(outSec) ||
      outSec <= inSec ||
      outSec > durationSec!
    ) {
      setStatus('Set a valid in and out time within the composition.');
      return;
    }
    setStatus(null);
    if (inSec !== node.inSec || outSec !== node.outSec)
      onCommand({ type: 'layer.timing', nodeId: node.nodeId, inSec, outSec });
  };

  const addKeyframe = () => {
    if (!selectedChannel || !activeChannelEnabled || !node || disabled || !frameRate) return;
    const timeSec = snapMotionTime(playheadSec, selectedChannel.frameRate!);
    const existing = selectedFrames.find((frame) => Math.abs(frame.timeSec - timeSec) < 1e-7);
    if (existing) {
      setSelectedFrameId(existing.keyframeId);
      setStatus('A keyframe already exists at this frame.');
      return;
    }
    const sample = sampleMotionChannel(selectedChannel, timeSec);
    const value =
      selectedChannel.keyframes.length === 0 ? startingValue(selectedChannel) : sample.value;
    if (value === null) {
      setStatus(
        selectedChannel.keyframes.length === 0
          ? 'A verified native starting value is unavailable for this channel.'
          : sample.value === null
            ? sample.reason
            : 'The current motion value cannot be evaluated faithfully.',
      );
      return;
    }
    let commandValue: CommandFrame['value'];
    if (typeof value !== 'number') {
      if (!isNativeVector3(value)) {
        setStatus('The native channel did not provide an exact three-value vector.');
        return;
      }
      commandValue = [value[0], value[1], value[2]];
    } else if (Number.isFinite(value)) {
      commandValue = value;
    } else {
      setStatus('The native channel value is not finite.');
      return;
    }
    const keyframeId = `draft:${crypto.randomUUID()}` as const;
    const next = [
      ...selectedFrames,
      {
        keyframeId,
        timeSec,
        value: commandValue,
        inInterpolation: 'LINEAR' as const,
        outInterpolation: 'LINEAR' as const,
      },
    ].sort((left, right) => left.timeSec - right.timeSec);
    replaceFrames(next);
    setSelectedFrameId(keyframeId);
    setStatus(null);
  };

  const editFrame = (keyframeId: string, change: Partial<CommandFrame>) => {
    if (!selectedChannel || !activeChannelEnabled) return;
    const next = selectedFrames
      .map((frame) => (frame.keyframeId === keyframeId ? { ...frame, ...change } : frame))
      .sort((left, right) => left.timeSec - right.timeSec);
    if (new Set(next.map((frame) => frame.timeSec)).size !== next.length) {
      setStatus('Two keyframes cannot use the same frame.');
      return;
    }
    setStatus(null);
    replaceFrames(next);
  };

  const commitKeyframeTime = () => {
    if (
      !selectedChannel ||
      !selectedFrame ||
      !selectedChannel.frameRate ||
      disabled ||
      !activeChannelEnabled
    )
      return;
    const draft = keyframeTimeDraftRef.current.trim();
    const value = Number(draft);
    if (!draft || !Number.isFinite(value)) {
      setStatus('Enter a finite keyframe time within the composition.');
      return;
    }
    const timeSec = snapMotionTime(value, selectedChannel.frameRate);
    if (timeSec < 0 || (durationSec != null && timeSec > durationSec)) {
      setStatus('Keyframe time must stay within the composition.');
      return;
    }
    if (
      selectedFrames.some(
        (frame) =>
          frame.keyframeId !== selectedFrame.keyframeId && Math.abs(frame.timeSec - timeSec) < 1e-7,
      )
    ) {
      setStatus('Two keyframes cannot use the same frame.');
      return;
    }
    keyframeTimeDraftRef.current = String(timeSec);
    setKeyframeTimeDraft(String(timeSec));
    const lastCommitted = lastCommittedKeyframeTimeRef.current;
    if (
      timeSec === selectedFrame.timeSec ||
      (lastCommitted?.nodeId === node?.nodeId &&
        lastCommitted.channelId === selectedChannel.channelId &&
        lastCommitted.keyframeId === selectedFrame.keyframeId &&
        lastCommitted.timeSec === timeSec)
    )
      return;
    if (node)
      lastCommittedKeyframeTimeRef.current = {
        nodeId: node.nodeId,
        channelId: selectedChannel.channelId,
        keyframeId: selectedFrame.keyframeId,
        timeSec,
      };
    editFrame(selectedFrame.keyframeId, { timeSec });
  };

  const beginKeyframeDrag = (event: ReactPointerEvent<HTMLButtonElement>, frame: CommandFrame) => {
    if (
      !selectedChannel ||
      !activeChannelEnabled ||
      disabled ||
      !hasClock ||
      !durationSec ||
      !selectedChannel.frameRate
    )
      return;
    const track = keyframeTrackRef.current?.getBoundingClientRect();
    if (!track || track.width <= 0) return;
    const drag = {
      keyframeId: frame.keyframeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      trackLeft: track.left,
      trackWidth: track.width,
      startTimeSec: frame.timeSec,
      durationSec,
      frameRate: selectedChannel.frameRate,
      frameDelta: 0,
    };
    keyframeDragRef.current = drag;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedFrameId(frame.keyframeId);
    setPlaying(false);
  };

  const updateKeyframeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = keyframeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaPx = event.clientX - drag.startX;
    const requestedDelta = Math.round(
      (deltaPx / drag.trackWidth) * drag.durationSec * drag.frameRate,
    );
    const firstFrame = Math.round(drag.startTimeSec * drag.frameRate);
    const lastFrame = Math.round(drag.durationSec * drag.frameRate);
    drag.frameDelta = Math.max(-firstFrame, Math.min(lastFrame - firstFrame, requestedDelta));
    if (Math.abs(deltaPx) >= 1) {
      setDragPreview({
        keyframeId: drag.keyframeId,
        timeSec: snapMotionTime(
          drag.startTimeSec + drag.frameDelta / drag.frameRate,
          drag.frameRate,
        ),
      });
    }
  };

  const finishKeyframeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = keyframeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    keyframeDragRef.current = null;
    const deltaPx = event.clientX - drag.startX;
    const requestedDelta = Math.round(
      (deltaPx / drag.trackWidth) * drag.durationSec * drag.frameRate,
    );
    const firstFrame = Math.round(drag.startTimeSec * drag.frameRate);
    const lastFrame = Math.round(drag.durationSec * drag.frameRate);
    const frameDelta = Math.max(-firstFrame, Math.min(lastFrame - firstFrame, requestedDelta));
    setDragPreview(null);
    if (Math.abs(deltaPx) < 1 || frameDelta === 0) return;
    suppressKeyframeClickRef.current = true;
    const next = moveMotionKeyframe(selectedFrames, drag.keyframeId, frameDelta, drag.frameRate);
    if (!next) {
      setStatus('That move would place two keyframes on the same frame.');
      return;
    }
    replaceFrames(next);
    setStatus(null);
  };

  const cancelKeyframeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (keyframeDragRef.current?.pointerId !== event.pointerId) return;
    keyframeDragRef.current = null;
    setDragPreview(null);
  };

  const setInterpolation = (side: 'in' | 'out', value: Interpolation) => {
    if (!selectedChannel || !selectedFrame) return;
    const dimensions = motionEaseDimensions(selectedChannel);
    const ease = Array.from({ length: dimensions }, () => ({
      speed: 0,
      influence: 33.333,
    }));
    editFrame(selectedFrame.keyframeId, {
      [side === 'in' ? 'inInterpolation' : 'outInterpolation']: value,
      ...(value === 'BEZIER' && side === 'in' && !selectedFrame.inEase?.length
        ? { inEase: ease }
        : {}),
      ...(value === 'BEZIER' && side === 'out' && !selectedFrame.outEase?.length
        ? { outEase: ease }
        : {}),
    });
  };

  const editEase = (
    side: 'in' | 'out',
    axis: number,
    key: 'speed' | 'influence',
    value: number,
  ) => {
    if (!selectedChannel || !selectedFrame || !Number.isFinite(value)) return;
    const easeKey = side === 'in' ? 'inEase' : 'outEase';
    const current = [...(selectedFrame[easeKey] ?? [])];
    while (current.length < motionEaseDimensions(selectedChannel))
      current.push({ speed: 0, influence: 33.333 });
    current[axis] = { ...current[axis]!, [key]: value };
    editFrame(selectedFrame.keyframeId, { [easeKey]: current });
  };

  const removeFrame = (keyframeId: string) => {
    if (!selectedChannel) return;
    const next = selectedFrames.filter((frame) => frame.keyframeId !== keyframeId);
    replaceFrames(next);
    setSelectedFrameId(next[0]?.keyframeId ?? '');
    setStatus(null);
  };

  const selectAdjacentFrame = (direction: -1 | 1) => {
    if (!selectedFrames.length || !selectedFrame) return;
    const index = selectedFrames.findIndex(
      (frame) => frame.keyframeId === selectedFrame.keyframeId,
    );
    const next =
      selectedFrames[Math.max(0, Math.min(selectedFrames.length - 1, index + direction))];
    if (!next || next.keyframeId === selectedFrame.keyframeId) return;
    setPlaying(false);
    setSelectedFrameId(next.keyframeId);
    onPlayheadChange(next.timeSec);
  };

  const moveSelectedFrame = (delta: -1 | 1) => {
    if (!selectedChannel || !selectedFrame || !selectedChannel.frameRate) return;
    const next = moveMotionKeyframe(
      selectedFrames,
      selectedFrame.keyframeId,
      delta,
      selectedChannel.frameRate,
    );
    if (!next) {
      setStatus('That move would place two keyframes on the same frame.');
      return;
    }
    replaceFrames(next);
    setStatus(null);
  };

  if (!node)
    return (
      <section
        aria-label={translateUi('layer_timeline_f918f541')}
        className="border-t border-border px-3 py-2 text-xs text-muted-foreground"
      >
        {' '}
        {translateUi('select_a_layer_to_inspect_its_timin_fa4abefa')}{' '}
      </section>
    );

  return (
    <section
      aria-label={translateUi('layer_timeline_f918f541')}
      className={`shrink-0 border-t border-border bg-card px-3 ${compact ? 'py-1.5' : 'py-2'}`}
    >
      <div
        className={`flex items-center justify-between ${compact ? 'min-h-5 gap-2' : 'flex-wrap gap-2'}`}
      >
        <div className={compact ? 'flex min-w-0 items-center gap-1.5' : 'min-w-0'}>
          <h3 className="shrink-0 text-xs font-medium">{translateUi('timeline_9dcff98e')}</h3>
          {compact ? (
            <span aria-hidden="true" className="text-2xs text-muted-foreground">
              ·
            </span>
          ) : null}
          <p
            className={`${compact ? 'min-w-0 truncate' : 'max-w-64 truncate'} text-2xs text-muted-foreground`}
          >
            {node.name ?? node.textContent ?? translateUi('selected_layer_8b325666')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={disabled || !hasClock}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {playing ? translateUi('pause_858e4ba7') : translateUi('play_436e6101')}
          </Button>
          <span
            className={`${compact ? 'min-w-16' : 'min-w-20'} text-right font-mono text-2xs text-muted-foreground`}
          >
            {timeLabel(playheadSec, displayLocale)}
            {durationSec == null ? ' / —' : ` / ${timeLabel(durationSec, displayLocale)}`}
          </span>
          {currentFrameIndex !== null ? (
            <span
              aria-live="off"
              className="whitespace-nowrap font-mono text-2xs text-muted-foreground"
            >
              {translateUi('frame_d0b50e06')}{' '}
              {currentFrame === null ? translateUi('end_f4db1e48') : currentFrame}
              {totalFrames === null ? '' : ` / ${totalFrames}`}
            </span>
          ) : null}
        </div>
      </div>
      <div className={`${compact ? 'mt-1' : 'mt-2'} flex items-center gap-2`}>
        <input
          aria-label={translateUi('timeline_playhead_145f3baf')}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed"
          type="range"
          min={0}
          max={durationSec ?? 0}
          step={frameRate ? 1 / frameRate : 'any'}
          value={Math.min(playheadSec, durationSec ?? 0)}
          disabled={disabled || !hasClock}
          onChange={(event) => {
            setPlaying(false);
            const next = Number(event.target.value);
            onPlayheadChange(frameRate ? snapMotionTime(next, frameRate) : next);
          }}
        />
      </div>
      {!compact || selectedFrames.length > 0 ? (
        <div
          ref={keyframeTrackRef}
          data-testid="keyframe-track"
          className={`relative ${compact ? 'mt-0.5 h-5' : 'mt-1 h-6'} min-w-0 rounded bg-muted/40`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border"
          />
          {selectedFrames.map((frame) => {
            const displayTime =
              dragPreview?.keyframeId === frame.keyframeId ? dragPreview.timeSec : frame.timeSec;
            const left =
              durationSec && durationSec > 0
                ? `${Math.max(0, Math.min(100, (displayTime / durationSec) * 100))}%`
                : '0%';
            return (
              <Button
                key={frame.keyframeId}
                size="icon-xs"
                variant={frame.keyframeId === selectedFrame?.keyframeId ? 'secondary' : 'outline'}
                aria-label={translateUi('drag_value0_keyframe_at_value1_448d73a4', {
                  value0: String(presentForge(LABELS[selectedChannel?.channel ?? 'position'])),
                  value1: String(timeLabel(displayTime, displayLocale)),
                })}
                className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 touch-none ${activeChannelEnabled && hasClock && !disabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                style={{ left }}
                onPointerDown={(event) => beginKeyframeDrag(event, frame)}
                onPointerMove={updateKeyframeDrag}
                onPointerUp={finishKeyframeDrag}
                onPointerCancel={cancelKeyframeDrag}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Escape' &&
                    keyframeDragRef.current?.keyframeId === frame.keyframeId
                  ) {
                    keyframeDragRef.current = null;
                    setDragPreview(null);
                  }
                }}
                onClick={() => {
                  if (suppressKeyframeClickRef.current) {
                    suppressKeyframeClickRef.current = false;
                    return;
                  }
                  setPlaying(false);
                  setSelectedFrameId(frame.keyframeId);
                  onPlayheadChange(frame.timeSec);
                }}
              >
                <span className="sr-only">{timeLabel(displayTime, displayLocale)}</span>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              </Button>
            );
          })}
        </div>
      ) : null}
      {!hasClock ? (
        <p className="mt-1 text-2xs text-muted-foreground">
          {translateUi('timeline_playback_is_unavailable_un_a9da1199')}
        </p>
      ) : null}

      <Collapsible
        open={!compact || motionOpen}
        onOpenChange={(open) => {
          setMotionOpen(open);
          onMotionOpenChange?.(open);
        }}
      >
        <div
          className={`${compact ? 'mt-1 flex flex-wrap items-center gap-1.5' : 'mt-2 flex flex-wrap items-end gap-2'}`}
        >
          <label
            htmlFor={`${controlId}-layer-in`}
            className={`${compact ? 'flex items-center gap-1 text-xs' : 'grid gap-1 text-xs'} text-muted-foreground`}
          >
            {compact ? translateUi('in_8bc1d53c') : translateUi('in_seconds_92c5acb3')}
            <Input
              id={`${controlId}-layer-in`}
              aria-label={translateUi('layer_in_time_9f4e2f7d')}
              type="number"
              step={frameRate ? 1 / frameRate : 'any'}
              value={inDraft}
              disabled={disabled || !timingEnabled}
              onChange={(event) => setInDraft(event.target.value)}
              className={`${compact ? 'h-6 w-16' : 'h-7 w-24'} text-xs`}
            />
          </label>
          <label
            htmlFor={`${controlId}-layer-out`}
            className={`${compact ? 'flex items-center gap-1 text-xs' : 'grid gap-1 text-xs'} text-muted-foreground`}
          >
            {compact ? translateUi('out_9a3c5460') : translateUi('out_seconds_35f5d296')}
            <Input
              id={`${controlId}-layer-out`}
              aria-label={translateUi('layer_out_time_af7cbd08')}
              type="number"
              step={frameRate ? 1 / frameRate : 'any'}
              value={outDraft}
              disabled={disabled || !timingEnabled}
              onChange={(event) => setOutDraft(event.target.value)}
              className={`${compact ? 'h-6 w-16' : 'h-7 w-24'} text-xs`}
            />
          </label>
          {timingEnabled ? (
            <Button
              size="xs"
              variant="outline"
              className={compact ? 'h-6' : undefined}
              disabled={
                disabled || (Number(inDraft) === node.inSec && Number(outDraft) === node.outSec)
              }
              onClick={commitTiming}
            >
              {translateUi('apply_timing_436a9b2e')}
            </Button>
          ) : (
            <p className="max-w-72 pb-1 text-2xs text-muted-foreground">
              {node.kind === 'group' && !groupMotionAllowed
                ? translateUi('group_timing_and_motion_are_waiting_e4b981d2')
                : node.timingReason
                  ? presentForge(friendlyLockReason(node.timingReason))
                  : translateUi('native_timing_is_not_verified_for_t_26fe813c')}
            </p>
          )}
          {compact ? (
            <CollapsibleTrigger
              render={<Button size="xs" variant="ghost" className="h-6" />}
              disabled={!channels.length}
            >
              <ChevronDown aria-hidden="true" className={motionOpen ? 'rotate-180' : undefined} />
              {motionOpen
                ? translateUi('hide_keyframes_e3eacccc')
                : translateUi('edit_keyframes_f6c1e501')}{' '}
              · {channels.reduce((sum, channel) => sum + channel.keyframes.length, 0)}{' '}
              {translateUi('keys_48a53f07')}{' '}
            </CollapsibleTrigger>
          ) : null}
        </div>

        <CollapsibleContent>
          <div className="mt-1 grid min-h-0 gap-1.5 border-t border-border pt-1.5">
            <ul
              className="flex flex-wrap items-center gap-1"
              aria-label={translateUi('motion_channels_65e0e7e6')}
            >
              {channelsWithLocks.map(({ channel, lockReason }) => (
                <li key={channel.channelId}>
                  <button
                    type="button"
                    aria-current={
                      selectedChannel?.channelId === channel.channelId ? 'true' : undefined
                    }
                    className={`flex min-h-7 items-center justify-between gap-2 rounded px-2 text-left text-xs ${selectedChannel?.channelId === channel.channelId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                    onClick={() => {
                      setSelectedChannelId(channel.channelId);
                      setSelectedFrameId('');
                      setStatus(null);
                    }}
                  >
                    <span>{presentForge(LABELS[channel.channel])}</span>
                    <span>
                      {lockReason
                        ? translateUi('locked_a424e33d')
                        : translateUi('value0_keys_78c0fc22', {
                            count: Number(channel.keyframes.length),
                          })}
                    </span>
                  </button>
                </li>
              ))}
              {selectedChannel ? (
                <li className="ml-auto flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="outline"
                    className="text-xs"
                    disabled={
                      disabled ||
                      !activeChannelEnabled ||
                      !hasClock ||
                      selectedChannel.frameRate == null ||
                      (!selectedChannel.keyframes.length && !hasVerifiedStartValue)
                    }
                    onClick={addKeyframe}
                  >
                    <Plus aria-hidden="true" /> {translateUi('add_at_playhead_1c335439')}{' '}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-xs"
                    disabled={disabled || !activeChannelEnabled || selectedFrames.length === 0}
                    onClick={() => {
                      replaceFrames([]);
                      setSelectedFrameId('');
                    }}
                  >
                    {' '}
                    {translateUi('clear_keys_b21cc08d')}{' '}
                  </Button>
                </li>
              ) : null}
              {!channels.length ? (
                <li className="text-2xs text-muted-foreground">
                  {translateUi('no_native_motion_channels_were_repo_231df272')}
                </li>
              ) : null}
            </ul>
            <div className="min-w-0">
              {selectedChannel ? (
                <>
                  {channelLockReason(selectedChannel) ? (
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {presentForge(friendlyLockReason(channelLockReason(selectedChannel)!))}
                    </p>
                  ) : null}
                  {!selectedChannel.keyframes.length && !hasVerifiedStartValue ? (
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {translateUi('the_first_key_waits_for_an_exact_na_70a64e8a')}
                    </p>
                  ) : null}
                  {selectedChannel.keyframes.some(
                    (frame) =>
                      frame.inInterpolation === 'BEZIER' || frame.outInterpolation === 'BEZIER',
                  ) ? (
                    <>
                      <p id={`${controlId}-motion-bezier-help`} className="sr-only">
                        {translateUi('canvas_playback_evaluates_supported_4b87f960')}
                      </p>
                      {activeSample?.value === null ? (
                        <p role="status" className="mt-1 text-2xs text-muted-foreground">
                          {translateUi('canvas_sample_unavailable_b8d0dbda')} {activeSample.reason}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <div className="mt-1 flex min-w-0 items-center gap-1">
                    {selectedFrames.length > 1 ? (
                      <>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="shrink-0 text-xs"
                          aria-label={translateUi('previous_keyframe_96053ffe')}
                          disabled={disabled || selectedFrame === selectedFrames[0]}
                          onClick={() => selectAdjacentFrame(-1)}
                        >
                          {translateUi('previous_key_87d8cd6e')}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="shrink-0 text-xs"
                          aria-label={translateUi('next_keyframe_5eb17b96')}
                          disabled={disabled || selectedFrame === selectedFrames.at(-1)}
                          onClick={() => selectAdjacentFrame(1)}
                        >
                          {translateUi('next_key_a1ab0c28')}
                        </Button>
                      </>
                    ) : null}
                    <ul
                      aria-label={translateUi('keyframe_key_list_bd2ba69c')}
                      className="m-0 flex min-w-0 flex-1 list-none gap-1 overflow-x-auto rounded-sm p-0"
                    >
                      {selectedFrames.map((frame, index) => (
                        <li key={frame.keyframeId} className="shrink-0">
                          <Button
                            size="xs"
                            variant={
                              frame.keyframeId === selectedFrame?.keyframeId
                                ? 'secondary'
                                : 'outline'
                            }
                            aria-label={translateUi(
                              'edit_value0_keyframe_value1_at_valu_bf006f81',
                              {
                                value0: String(presentForge(LABELS[selectedChannel.channel])),
                                value1: String(index + 1),
                                value2: String(timeLabel(frame.timeSec, displayLocale)),
                              },
                            )}
                            className="text-xs"
                            onClick={() => {
                              setPlaying(false);
                              setSelectedFrameId(frame.keyframeId);
                              onPlayheadChange(frame.timeSec);
                            }}
                          >
                            ◆ {timeLabel(frame.timeSec, displayLocale)}
                          </Button>
                        </li>
                      ))}
                      {!selectedFrames.length ? (
                        <li className="py-1 text-2xs text-muted-foreground">
                          {translateUi('no_keys_on_this_channel_fa08303f')}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                  {selectedFrame ? (
                    <fieldset
                      aria-label={translateUi('selected_keyframe_controls_064a2958')}
                      data-testid="selected-keyframe-controls"
                      className="mt-1 grid gap-1 rounded-md border border-border bg-background/50 p-1"
                    >
                      <div className="flex flex-wrap items-end gap-1.5">
                        <label
                          htmlFor={`${controlId}-keyframe-time`}
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          {' '}
                          {translateUi('time_s_d8717b31')}{' '}
                          <Input
                            id={`${controlId}-keyframe-time`}
                            aria-label={translateUi('keyframe_time_91d454ec')}
                            className="h-7 w-20 text-xs"
                            type="number"
                            step={selectedChannel.frameRate ? 1 / selectedChannel.frameRate : 'any'}
                            value={keyframeTimeDraft}
                            disabled={disabled || !activeChannelEnabled}
                            onChange={(event) => {
                              keyframeTimeDraftRef.current = event.target.value;
                              setKeyframeTimeDraft(event.target.value);
                            }}
                            onBlur={commitKeyframeTime}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitKeyframeTime();
                              }
                              if (event.key === 'Escape') {
                                const draft = String(selectedFrame.timeSec);
                                keyframeTimeDraftRef.current = draft;
                                setKeyframeTimeDraft(draft);
                                setStatus(null);
                              }
                            }}
                          />
                        </label>
                        <div className="flex h-7 items-center gap-1">
                          <Button
                            size="xs"
                            variant="outline"
                            className="text-xs"
                            aria-label={translateUi('move_keyframe_one_frame_earlier_b9c659e3')}
                            disabled={disabled || !activeChannelEnabled}
                            onClick={() => moveSelectedFrame(-1)}
                          >
                            −1f
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            className="text-xs"
                            aria-label={translateUi('move_keyframe_one_frame_later_1865c4e2')}
                            disabled={disabled || !activeChannelEnabled}
                            onClick={() => moveSelectedFrame(1)}
                          >
                            +1f
                          </Button>
                        </div>
                        {(Array.isArray(selectedFrame.value)
                          ? selectedFrame.value.slice(0, 2)
                          : [selectedFrame.value]
                        ).map((component, axis) => (
                          <label
                            key={axis}
                            htmlFor={`${controlId}-keyframe-value-${axis}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground"
                          >
                            {Array.isArray(selectedFrame.value)
                              ? AXES[axis]
                              : presentForge(LABELS[selectedChannel.channel])}
                            <Input
                              id={`${controlId}-keyframe-value-${axis}`}
                              aria-label={translateUi('value0_value1_value_7c3772c9', {
                                value0: String(presentForge(LABELS[selectedChannel.channel])),
                                value1: String(
                                  Array.isArray(selectedFrame.value) ? AXES[axis] : '',
                                ),
                              })}
                              className="h-7 w-20 text-xs"
                              type="number"
                              step="any"
                              value={component}
                              disabled={disabled || !activeChannelEnabled}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                if (!Number.isFinite(value)) return;
                                let nextValue: CommandFrame['value'] = value;
                                if (Array.isArray(selectedFrame.value)) {
                                  const vector: [number, number, number] = [
                                    selectedFrame.value[0]!,
                                    selectedFrame.value[1]!,
                                    selectedFrame.value[2]!,
                                  ];
                                  vector[axis] = value;
                                  nextValue = vector;
                                }
                                editFrame(selectedFrame.keyframeId, {
                                  value: nextValue,
                                });
                              }}
                            />
                          </label>
                        ))}
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={translateUi('delete_selected_keyframe_8af8c15a')}
                          disabled={disabled || !activeChannelEnabled}
                          onClick={() => removeFrame(selectedFrame.keyframeId)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(['in', 'out'] as const).map((side) => (
                          <label
                            key={side}
                            htmlFor={`${controlId}-${side}-interpolation`}
                            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
                          >
                            {side === 'in'
                              ? translateUi('incoming_interpolation_02a9c78f')
                              : translateUi('outgoing_interpolation_76ae4bfa')}
                            <Select
                              value={
                                selectedFrame[
                                  side === 'in' ? 'inInterpolation' : 'outInterpolation'
                                ]
                              }
                              disabled={disabled || !activeChannelEnabled}
                              onValueChange={(value) =>
                                setInterpolation(side, value as Interpolation)
                              }
                            >
                              <SelectTrigger
                                id={`${controlId}-${side}-interpolation`}
                                size="sm"
                                className="h-7 w-28 text-xs"
                                aria-label={translateUi('value0_interpolation_e42a3a4e', {
                                  value0: String(side),
                                })}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LINEAR" className="text-xs">
                                  {translateUi('linear_e6950b45')}
                                </SelectItem>
                                <SelectItem value="HOLD" className="text-xs">
                                  {translateUi('hold_8e685d54')}
                                </SelectItem>
                                <SelectItem value="BEZIER" className="text-xs">
                                  {translateUi('bezier_98ae0d2a')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                        ))}
                      </div>
                      <div
                        data-testid="motion-ease-controls"
                        className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2"
                      >
                        {(['in', 'out'] as const).map((side) =>
                          selectedFrame[side === 'in' ? 'inInterpolation' : 'outInterpolation'] ===
                          'BEZIER' ? (
                            <div
                              key={side}
                              className={`grid min-w-0 grid-cols-1 gap-1 rounded bg-muted/40 p-1 ${selectedChannel.channel === 'scale' ? 'sm:grid-cols-2' : ''}`}
                            >
                              {Array.from(
                                {
                                  length:
                                    selectedChannel.channel === 'scale'
                                      ? 2
                                      : motionEaseDimensions(selectedChannel),
                                },
                                (_, axis) => axis,
                              ).map((axis) => {
                                const ease = (side === 'in'
                                  ? selectedFrame.inEase
                                  : selectedFrame.outEase)?.[axis] ?? {
                                  speed: 0,
                                  influence: 33.333,
                                };
                                return (
                                  <fieldset
                                    key={`${side}:${axis}`}
                                    aria-describedby={`${controlId}-motion-bezier-help`}
                                    className="min-w-0"
                                  >
                                    <legend className="text-xs text-muted-foreground">
                                      {side === 'in'
                                        ? translateUi('incoming_e301820a')
                                        : translateUi('outgoing_3619cf0b')}{' '}
                                      {motionEaseAxisLabel(selectedChannel, axis)}{' '}
                                      {translateUi('ease_914ff41a')}
                                    </legend>
                                    <div className="flex flex-wrap items-center gap-1">
                                      {(['speed', 'influence'] as const).map((key) => (
                                        <label
                                          key={key}
                                          htmlFor={`${controlId}-${side}-ease-${axis}-${key}`}
                                          className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
                                        >
                                          {key === 'speed'
                                            ? translateUi('speed_c372fee9')
                                            : translateUi('influence_8b98959b')}
                                          <Input
                                            id={`${controlId}-${side}-ease-${axis}-${key}`}
                                            aria-label={translateUi(
                                              'value0_value1_ease_value2_baf3eff0',
                                              {
                                                value0: String(side),
                                                value1: String(
                                                  motionEaseAxisLabel(selectedChannel, axis),
                                                ),
                                                value2: String(key),
                                              },
                                            )}
                                            type="number"
                                            step="any"
                                            min={key === 'influence' ? 0.1 : undefined}
                                            max={key === 'influence' ? 100 : undefined}
                                            value={ease[key]}
                                            className="h-7 w-16 text-xs"
                                            disabled={disabled || !activeChannelEnabled}
                                            onChange={(event) =>
                                              editEase(side, axis, key, Number(event.target.value))
                                            }
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  </fieldset>
                                );
                              })}
                            </div>
                          ) : null,
                        )}
                      </div>
                    </fieldset>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {status ? (
        <p role="status" className="mt-1 text-2xs text-muted-foreground">
          {status}
        </p>
      ) : null}
    </section>
  );
}

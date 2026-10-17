'use client';

import type { TemplateAuthoringCommand, TemplateAuthoringNode } from '@continuum/contracts';
import { ChevronDown, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  channelLockReason,
  keyframeCommandFrames,
  moveMotionKeyframe,
  motionEaseAxisLabel,
  motionEaseDimensions,
  sampleMotionChannel,
  snapMotionTime,
  type AuthoringMotionChannel,
} from './templateAuthoringMotion';

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
const timeLabel = (seconds: number) => `${seconds.toFixed(3)} s`;

function friendlyLockReason(reason: string): string {
  const key = reason.toLowerCase();
  if (key.includes('generated_group_timing_unsupported'))
    return 'Group timing stays locked because its parent layer does not trim child layers.';
  if (key.includes('expression')) return 'Expression-driven motion is preserved and cannot be edited here.';
  if (key.includes('roving')) return 'Roving keyframes are preserved and cannot be edited here.';
  if (key.includes('tangent') || key.includes('continuity') || key.includes('auto_bezier'))
    return 'This motion uses spatial or automatic easing that is not editable in this timeline.';
  if (key.includes('separated')) return 'Separated motion channels are preserved and remain locked.';
  if (key.includes('3d')) return '3D motion is preserved; this timeline edits verified 2D motion only.';
  if (key.includes('pending') || key.includes('unavailable')) return 'Native motion details are still being verified.';
  return 'This channel is preserved and locked until its native motion can be verified.';
}

function startingValue(channel: AuthoringMotionChannel): number | [number, number, number] | null {
  const value = channel.baseValue;
  if (channel.channel === 'position' || channel.channel === 'scale') {
    return Array.isArray(value) && value.length === 3
      ? [value[0]!, value[1]!, value[2]!]
      : null;
  }
  return typeof value === 'number' ? value : null;
}

function isNativeVector3(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);
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
  const controlId = useId();
  const [motionOpen, setMotionOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [inDraft, setInDraft] = useState('');
  const [outDraft, setOutDraft] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState('');
  const [keyframeTimeDraft, setKeyframeTimeDraft] = useState('');
  const [dragPreview, setDragPreview] = useState<{ keyframeId: string; timeSec: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const keyframeTimeDraftRef = useRef('');
  const lastCommittedKeyframeTimeRef = useRef<{ nodeId: string; channelId: string; keyframeId: string; timeSec: number } | null>(null);
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
    () => channels.map((channel) => ({ channel, lockReason: channelLockReason(channel) })),
    [channels],
  );
  const selectedChannel = channels.find((channel) => channel.channelId === selectedChannelId)
    ?? channelsWithLocks.find(({ lockReason }) => lockReason === null)?.channel
    ?? channels[0]
    ?? null;
  const selectedFrames = selectedChannel ? keyframeCommandFrames(selectedChannel) : [];
  const selectedFrame = selectedFrames.find((frame) => frame.keyframeId === selectedFrameId)
    ?? selectedFrames[0]
    ?? null;
  const timingEnabled = !!node && node.kind !== 'group' && groupMotionAllowed && (node.sourceRef !== null || node.nodeId.startsWith('draft:')) &&
    node.capabilities.timing && node.timingReason === null && hasClock && durationSec !== null;
  const activeChannelEnabled = !!selectedChannel && groupMotionAllowed &&
    (node?.kind !== 'group' || selectedChannel.channel === 'position' || selectedChannel.channel === 'scale' || selectedChannel.channel === 'rotation') &&
    channelLockReason(selectedChannel) === null && !!node?.capabilities.keyframes;
  const hasVerifiedStartValue = selectedChannel ? startingValue(selectedChannel) !== null : false;
  const activeSample = selectedChannel ? sampleMotionChannel(selectedChannel, playheadSec) : null;
  const totalFrames = frameRate && durationSec != null && durationSec > 0
    ? compositionFrameCount(durationSec, frameRate)
    : null;
  const currentFrameIndex = frameRate ? Math.round(playheadSec * frameRate) : null;
  const currentFrame = currentFrameIndex !== null && totalFrames !== null && currentFrameIndex >= totalFrames
    ? null
    : currentFrameIndex === null ? null : currentFrameIndex + 1;

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
      setSelectedChannelId(channelsWithLocks.find(({ lockReason }) => lockReason === null)?.channel.channelId ?? channels[0]?.channelId ?? '');
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
      const elapsedFrames = Math.floor(Math.max(0, nowMs - startTimeMs) * frameRate / 1_000);
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
    if (!Number.isFinite(inSec) || !Number.isFinite(outSec) || outSec <= inSec || outSec > durationSec!) {
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
    const value = selectedChannel.keyframes.length === 0
      ? startingValue(selectedChannel)
      : sample.value;
    if (value === null) {
      setStatus(selectedChannel.keyframes.length === 0
        ? 'A verified native starting value is unavailable for this channel.'
        : sample.value === null
          ? sample.reason
          : 'The current motion value cannot be evaluated faithfully.');
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
    const next = [...selectedFrames, {
      keyframeId,
      timeSec,
      value: commandValue,
      inInterpolation: 'LINEAR' as const,
      outInterpolation: 'LINEAR' as const,
    }].sort((left, right) => left.timeSec - right.timeSec);
    replaceFrames(next);
    setSelectedFrameId(keyframeId);
    setStatus(null);
  };

  const editFrame = (keyframeId: string, change: Partial<CommandFrame>) => {
    if (!selectedChannel || !activeChannelEnabled) return;
    const next = selectedFrames.map((frame) => frame.keyframeId === keyframeId ? { ...frame, ...change } : frame)
      .sort((left, right) => left.timeSec - right.timeSec);
    if (new Set(next.map((frame) => frame.timeSec)).size !== next.length) {
      setStatus('Two keyframes cannot use the same frame.');
      return;
    }
    setStatus(null);
    replaceFrames(next);
  };

  const commitKeyframeTime = () => {
    if (!selectedChannel || !selectedFrame || !selectedChannel.frameRate || disabled || !activeChannelEnabled) return;
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
    if (selectedFrames.some((frame) => frame.keyframeId !== selectedFrame.keyframeId && Math.abs(frame.timeSec - timeSec) < 1e-7)) {
      setStatus('Two keyframes cannot use the same frame.');
      return;
    }
    keyframeTimeDraftRef.current = String(timeSec);
    setKeyframeTimeDraft(String(timeSec));
    const lastCommitted = lastCommittedKeyframeTimeRef.current;
    if (timeSec === selectedFrame.timeSec || (lastCommitted?.nodeId === node?.nodeId && lastCommitted.channelId === selectedChannel.channelId && lastCommitted.keyframeId === selectedFrame.keyframeId && lastCommitted.timeSec === timeSec)) return;
    if (node) lastCommittedKeyframeTimeRef.current = { nodeId: node.nodeId, channelId: selectedChannel.channelId, keyframeId: selectedFrame.keyframeId, timeSec };
    editFrame(selectedFrame.keyframeId, { timeSec });
  };

  const beginKeyframeDrag = (event: ReactPointerEvent<HTMLButtonElement>, frame: CommandFrame) => {
    if (!selectedChannel || !activeChannelEnabled || disabled || !hasClock || !durationSec || !selectedChannel.frameRate) return;
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
    const requestedDelta = Math.round(deltaPx / drag.trackWidth * drag.durationSec * drag.frameRate);
    const firstFrame = Math.round(drag.startTimeSec * drag.frameRate);
    const lastFrame = Math.round(drag.durationSec * drag.frameRate);
    drag.frameDelta = Math.max(-firstFrame, Math.min(lastFrame - firstFrame, requestedDelta));
    if (Math.abs(deltaPx) >= 1) {
      setDragPreview({
        keyframeId: drag.keyframeId,
        timeSec: snapMotionTime(drag.startTimeSec + drag.frameDelta / drag.frameRate, drag.frameRate),
      });
    }
  };

  const finishKeyframeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = keyframeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    keyframeDragRef.current = null;
    const deltaPx = event.clientX - drag.startX;
    const requestedDelta = Math.round(deltaPx / drag.trackWidth * drag.durationSec * drag.frameRate);
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
    const ease = Array.from({ length: dimensions }, () => ({ speed: 0, influence: 33.333 }));
    editFrame(selectedFrame.keyframeId, {
      [side === 'in' ? 'inInterpolation' : 'outInterpolation']: value,
      ...(value === 'BEZIER' && side === 'in' && !selectedFrame.inEase?.length ? { inEase: ease } : {}),
      ...(value === 'BEZIER' && side === 'out' && !selectedFrame.outEase?.length ? { outEase: ease } : {}),
    });
  };

  const editEase = (side: 'in' | 'out', axis: number, key: 'speed' | 'influence', value: number) => {
    if (!selectedChannel || !selectedFrame || !Number.isFinite(value)) return;
    const easeKey = side === 'in' ? 'inEase' : 'outEase';
    const current = [...(selectedFrame[easeKey] ?? [])];
    while (current.length < motionEaseDimensions(selectedChannel)) current.push({ speed: 0, influence: 33.333 });
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
    const index = selectedFrames.findIndex((frame) => frame.keyframeId === selectedFrame.keyframeId);
    const next = selectedFrames[Math.max(0, Math.min(selectedFrames.length - 1, index + direction))];
    if (!next || next.keyframeId === selectedFrame.keyframeId) return;
    setPlaying(false);
    setSelectedFrameId(next.keyframeId);
    onPlayheadChange(next.timeSec);
  };

  const moveSelectedFrame = (delta: -1 | 1) => {
    if (!selectedChannel || !selectedFrame || !selectedChannel.frameRate) return;
    const next = moveMotionKeyframe(selectedFrames, selectedFrame.keyframeId, delta, selectedChannel.frameRate);
    if (!next) {
      setStatus('That move would place two keyframes on the same frame.');
      return;
    }
    replaceFrames(next);
    setStatus(null);
  };

  if (!node) return (
    <section aria-label="Layer timeline" className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
      Select a layer to inspect its timing and motion.
    </section>
  );

  return (
    <section aria-label="Layer timeline" className={`shrink-0 border-t border-border bg-card px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      <div className={`flex items-center justify-between ${compact ? 'min-h-5 gap-2' : 'flex-wrap gap-2'}`}>
        <div className={compact ? 'flex min-w-0 items-center gap-1.5' : 'min-w-0'}>
          <h3 className="shrink-0 text-xs font-medium">Timeline</h3>
          {compact ? <span aria-hidden="true" className="text-2xs text-muted-foreground">·</span> : null}
          <p className={`${compact ? 'min-w-0 truncate' : 'max-w-64 truncate'} text-2xs text-muted-foreground`}>{node.name ?? node.textContent ?? 'Selected layer'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="xs" variant="outline" disabled={disabled || !hasClock} onClick={() => setPlaying((value) => !value)}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <span className={`${compact ? 'min-w-16' : 'min-w-20'} text-right font-mono text-2xs text-muted-foreground`}>
            {timeLabel(playheadSec)}{durationSec == null ? ' / —' : ` / ${timeLabel(durationSec)}`}
          </span>
          {currentFrameIndex !== null ? <span aria-live="off" className="whitespace-nowrap font-mono text-2xs text-muted-foreground">Frame {currentFrame === null ? 'End' : currentFrame}{totalFrames === null ? '' : ` / ${totalFrames}`}</span> : null}
        </div>
      </div>
      <div className={`${compact ? 'mt-1' : 'mt-2'} flex items-center gap-2`}>
        <input
          aria-label="Timeline playhead"
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
      {(!compact || selectedFrames.length > 0) ? <div ref={keyframeTrackRef} data-testid="keyframe-track" className={`relative ${compact ? 'mt-0.5 h-5' : 'mt-1 h-6'} min-w-0 rounded bg-muted/40`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
        {selectedFrames.map((frame) => {
          const displayTime = dragPreview?.keyframeId === frame.keyframeId ? dragPreview.timeSec : frame.timeSec;
          const left = durationSec && durationSec > 0 ? `${Math.max(0, Math.min(100, displayTime / durationSec * 100))}%` : '0%';
          return (
            <Button
              key={frame.keyframeId}
              size="icon-xs"
              variant={frame.keyframeId === selectedFrame?.keyframeId ? 'secondary' : 'outline'}
              aria-label={`Drag ${LABELS[selectedChannel?.channel ?? 'position']} keyframe at ${timeLabel(displayTime)}`}
              className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 touch-none ${activeChannelEnabled && hasClock && !disabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              style={{ left }}
              onPointerDown={(event) => beginKeyframeDrag(event, frame)}
              onPointerMove={updateKeyframeDrag}
              onPointerUp={finishKeyframeDrag}
              onPointerCancel={cancelKeyframeDrag}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && keyframeDragRef.current?.keyframeId === frame.keyframeId) {
                  keyframeDragRef.current = null;
                  setDragPreview(null);
                }
              }}
              onClick={() => {
                if (suppressKeyframeClickRef.current) { suppressKeyframeClickRef.current = false; return; }
                setPlaying(false);
                setSelectedFrameId(frame.keyframeId);
                onPlayheadChange(frame.timeSec);
              }}
            >
              <span className="sr-only">{timeLabel(displayTime)}</span>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            </Button>
          );
        })}
      </div> : null}
      {!hasClock ? <p className="mt-1 text-2xs text-muted-foreground">Timeline playback is unavailable until the composition frame clock is verified.</p> : null}

      <Collapsible open={!compact || motionOpen} onOpenChange={(open) => { setMotionOpen(open); onMotionOpenChange?.(open); }}>
      <div className={`${compact ? 'mt-1 flex flex-wrap items-center gap-1.5' : 'mt-2 flex flex-wrap items-end gap-2'}`}>
        <label htmlFor={`${controlId}-layer-in`} className={`${compact ? 'flex items-center gap-1 text-xs' : 'grid gap-1 text-xs'} text-muted-foreground`}>
          {compact ? 'In' : 'In (seconds)'}
          <Input id={`${controlId}-layer-in`} aria-label="Layer in time" type="number" step={frameRate ? 1 / frameRate : 'any'} value={inDraft} disabled={disabled || !timingEnabled} onChange={(event) => setInDraft(event.target.value)} className={`${compact ? 'h-6 w-16' : 'h-7 w-24'} text-xs`} />
        </label>
        <label htmlFor={`${controlId}-layer-out`} className={`${compact ? 'flex items-center gap-1 text-xs' : 'grid gap-1 text-xs'} text-muted-foreground`}>
          {compact ? 'Out' : 'Out (seconds)'}
          <Input id={`${controlId}-layer-out`} aria-label="Layer out time" type="number" step={frameRate ? 1 / frameRate : 'any'} value={outDraft} disabled={disabled || !timingEnabled} onChange={(event) => setOutDraft(event.target.value)} className={`${compact ? 'h-6 w-16' : 'h-7 w-24'} text-xs`} />
        </label>
        {timingEnabled ? <Button size="xs" variant="outline" className={compact ? 'h-6' : undefined} disabled={disabled || Number(inDraft) === node.inSec && Number(outDraft) === node.outSec} onClick={commitTiming}>Apply timing</Button> : (
          <p className="max-w-72 pb-1 text-2xs text-muted-foreground">{node.kind === 'group' && !groupMotionAllowed ? 'Group timing and motion are waiting for native writer readback.' : node.timingReason ? friendlyLockReason(node.timingReason) : 'Native timing is not verified for this layer.'}</p>
        )}
        {compact ? <CollapsibleTrigger render={<Button size="xs" variant="ghost" className="h-6" />} disabled={!channels.length}>
          <ChevronDown aria-hidden="true" className={motionOpen ? 'rotate-180' : undefined} />
          {motionOpen ? 'Hide keyframes' : 'Edit keyframes'} · {channels.reduce((sum, channel) => sum + channel.keyframes.length, 0)} keys
        </CollapsibleTrigger> : null}
      </div>

        <CollapsibleContent>
      <div className="mt-1 grid min-h-0 gap-1.5 border-t border-border pt-1.5">
        <ul className="flex flex-wrap items-center gap-1" aria-label="Motion channels">
          {channelsWithLocks.map(({ channel, lockReason }) => (
            <li key={channel.channelId}>
            <button
              type="button"
              aria-current={selectedChannel?.channelId === channel.channelId ? 'true' : undefined}
              className={`flex min-h-7 items-center justify-between gap-2 rounded px-2 text-left text-xs ${selectedChannel?.channelId === channel.channelId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => { setSelectedChannelId(channel.channelId); setSelectedFrameId(''); setStatus(null); }}
            >
              <span>{LABELS[channel.channel]}</span>
              <span>{lockReason ? 'Locked' : `${channel.keyframes.length} keys`}</span>
            </button>
            </li>
          ))}
          {selectedChannel ? <li className="ml-auto flex items-center gap-1">
            <Button size="xs" variant="outline" className="text-xs" disabled={disabled || !activeChannelEnabled || !hasClock || selectedChannel.frameRate == null || (!selectedChannel.keyframes.length && !hasVerifiedStartValue)} onClick={addKeyframe}>
              <Plus aria-hidden="true" /> Add at playhead
            </Button>
            <Button size="xs" variant="ghost" className="text-xs" disabled={disabled || !activeChannelEnabled || selectedFrames.length === 0} onClick={() => { replaceFrames([]); setSelectedFrameId(''); }}>
              Clear keys
            </Button>
          </li> : null}
          {!channels.length ? <li className="text-2xs text-muted-foreground">No native motion channels were reported.</li> : null}
        </ul>
        <div className="min-w-0">
          {selectedChannel ? (
            <>
              {channelLockReason(selectedChannel) ? (
                <p className="mt-1 text-2xs text-muted-foreground">{friendlyLockReason(channelLockReason(selectedChannel)!)}</p>
              ) : null}
              {!selectedChannel.keyframes.length && !hasVerifiedStartValue ? (
                <p className="mt-1 text-2xs text-muted-foreground">The first key waits for an exact native starting value.</p>
              ) : null}
              {selectedChannel.keyframes.some((frame) => frame.inInterpolation === 'BEZIER' || frame.outInterpolation === 'BEZIER') ? (
                <>
                  <p id={`${controlId}-motion-bezier-help`} className="sr-only">Canvas playback evaluates supported Bezier segments from their native speed and influence values.</p>
                  {activeSample?.value === null ? <p role="status" className="mt-1 text-2xs text-muted-foreground">Canvas sample unavailable: {activeSample.reason}</p> : null}
                </>
              ) : null}
                <div className="mt-1 flex min-w-0 items-center gap-1">
                  {selectedFrames.length > 1 ? <>
                    <Button size="xs" variant="ghost" className="shrink-0 text-xs" aria-label="Previous keyframe" disabled={disabled || selectedFrame === selectedFrames[0]} onClick={() => selectAdjacentFrame(-1)}>Previous key</Button>
                    <Button size="xs" variant="ghost" className="shrink-0 text-xs" aria-label="Next keyframe" disabled={disabled || selectedFrame === selectedFrames.at(-1)} onClick={() => selectAdjacentFrame(1)}>Next key</Button>
                  </> : null}
                  <ul aria-label="Keyframe key list" className="m-0 flex min-w-0 flex-1 list-none gap-1 overflow-x-auto rounded-sm p-0">
                    {selectedFrames.map((frame, index) => (
                      <li key={frame.keyframeId} className="shrink-0">
                        <Button
                          size="xs"
                          variant={frame.keyframeId === selectedFrame?.keyframeId ? 'secondary' : 'outline'}
                          aria-label={`Edit ${LABELS[selectedChannel.channel]} keyframe ${index + 1} at ${timeLabel(frame.timeSec)}`}
                          className="text-xs"
                          onClick={() => { setPlaying(false); setSelectedFrameId(frame.keyframeId); onPlayheadChange(frame.timeSec); }}
                        >
                          ◆ {timeLabel(frame.timeSec)}
                        </Button>
                      </li>
                    ))}
                    {!selectedFrames.length ? <li className="py-1 text-2xs text-muted-foreground">No keys on this channel.</li> : null}
                  </ul>
              </div>
              {selectedFrame ? (
                <fieldset aria-label="Selected keyframe controls" data-testid="selected-keyframe-controls" className="mt-1 grid gap-1 rounded-md border border-border bg-background/50 p-1">
                  <div className="flex flex-wrap items-end gap-1.5">
                  <label htmlFor={`${controlId}-keyframe-time`} className="flex items-center gap-1 text-xs text-muted-foreground">
                    Time (s)
                    <Input id={`${controlId}-keyframe-time`} aria-label="Keyframe time" className="h-7 w-20 text-xs" type="number" step={selectedChannel.frameRate ? 1 / selectedChannel.frameRate : 'any'} value={keyframeTimeDraft} disabled={disabled || !activeChannelEnabled} onChange={(event) => {
                      keyframeTimeDraftRef.current = event.target.value;
                      setKeyframeTimeDraft(event.target.value);
                    }} onBlur={commitKeyframeTime} onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); commitKeyframeTime(); }
                      if (event.key === 'Escape') {
                        const draft = String(selectedFrame.timeSec);
                        keyframeTimeDraftRef.current = draft;
                        setKeyframeTimeDraft(draft);
                        setStatus(null);
                      }
                    }} />
                  </label>
                  <div className="flex h-7 items-center gap-1">
                    <Button size="xs" variant="outline" className="text-xs" aria-label="Move keyframe one frame earlier" disabled={disabled || !activeChannelEnabled} onClick={() => moveSelectedFrame(-1)}>−1f</Button>
                    <Button size="xs" variant="outline" className="text-xs" aria-label="Move keyframe one frame later" disabled={disabled || !activeChannelEnabled} onClick={() => moveSelectedFrame(1)}>+1f</Button>
                  </div>
                  {(Array.isArray(selectedFrame.value) ? selectedFrame.value.slice(0, 2) : [selectedFrame.value]).map((component, axis) => (
                        <label key={axis} htmlFor={`${controlId}-keyframe-value-${axis}`} className="flex items-center gap-1 text-xs text-muted-foreground">
                          {Array.isArray(selectedFrame.value) ? AXES[axis] : LABELS[selectedChannel.channel]}
                          <Input id={`${controlId}-keyframe-value-${axis}`} aria-label={`${LABELS[selectedChannel.channel]} ${Array.isArray(selectedFrame.value) ? AXES[axis] : ''} value`} className="h-7 w-20 text-xs" type="number" step="any" value={component} disabled={disabled || !activeChannelEnabled} onChange={(event) => {
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
                            editFrame(selectedFrame.keyframeId, { value: nextValue });
                          }} />
                        </label>
                  ))}
                  <Button size="icon-xs" variant="ghost" aria-label="Delete selected keyframe" disabled={disabled || !activeChannelEnabled} onClick={() => removeFrame(selectedFrame.keyframeId)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['in', 'out'] as const).map((side) => (
                      <label key={side} htmlFor={`${controlId}-${side}-interpolation`} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        {side === 'in' ? 'Incoming interpolation' : 'Outgoing interpolation'}
                        <Select value={selectedFrame[side === 'in' ? 'inInterpolation' : 'outInterpolation']} disabled={disabled || !activeChannelEnabled} onValueChange={(value) => setInterpolation(side, value as Interpolation)}>
                          <SelectTrigger id={`${controlId}-${side}-interpolation`} size="sm" className="h-7 w-28 text-xs" aria-label={`${side} interpolation`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LINEAR" className="text-xs">Linear</SelectItem>
                            <SelectItem value="HOLD" className="text-xs">Hold</SelectItem>
                            <SelectItem value="BEZIER" className="text-xs">Bezier</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    ))}
                  </div>
                  <div data-testid="motion-ease-controls" className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2">
                    {(['in', 'out'] as const).map((side) => selectedFrame[side === 'in' ? 'inInterpolation' : 'outInterpolation'] === 'BEZIER' ? (
                      <div key={side} className={`grid min-w-0 grid-cols-1 gap-1 rounded bg-muted/40 p-1 ${selectedChannel.channel === 'scale' ? 'sm:grid-cols-2' : ''}`}>
                        {(Array.from({ length: selectedChannel.channel === 'scale' ? 2 : motionEaseDimensions(selectedChannel) }, (_, axis) => axis)).map((axis) => {
                          const ease = (side === 'in' ? selectedFrame.inEase : selectedFrame.outEase)?.[axis] ?? { speed: 0, influence: 33.333 };
                          return (
                            <fieldset key={`${side}:${axis}`} aria-describedby={`${controlId}-motion-bezier-help`} className="min-w-0">
                              <legend className="text-xs text-muted-foreground">{side === 'in' ? 'Incoming' : 'Outgoing'} {motionEaseAxisLabel(selectedChannel, axis)} ease</legend>
                              <div className="flex flex-wrap items-center gap-1">
                                {(['speed', 'influence'] as const).map((key) => (
                                  <label key={key} htmlFor={`${controlId}-${side}-ease-${axis}-${key}`} className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                                    {key === 'speed' ? 'Speed' : 'Influence %'}
                                    <Input id={`${controlId}-${side}-ease-${axis}-${key}`} aria-label={`${side} ${motionEaseAxisLabel(selectedChannel, axis)} ease ${key}`} type="number" step="any" min={key === 'influence' ? 0.1 : undefined} max={key === 'influence' ? 100 : undefined} value={ease[key]} className="h-7 w-16 text-xs" disabled={disabled || !activeChannelEnabled} onChange={(event) => editEase(side, axis, key, Number(event.target.value))} />
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          );
                        })}
                      </div>
                    ) : null)}
                  </div>
                </fieldset>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
        </CollapsibleContent>
      </Collapsible>
      {status ? <p role="status" className="mt-1 text-2xs text-muted-foreground">{status}</p> : null}
    </section>
  );
}

'use client';

import {
  conceptLengthRule,
  HEADLESS_CONCEPTS,
  type HeadlessGrammar,
  PLATFORM_EXPORT_PRESETS,
  type PlatformExportPresetId,
  type VideoEditorOpOutput,
  type VideoEditorPoolAsset,
  type VideoEditorQuickStart,
} from '@continuum/contracts';
import {
  CircleDollarSign,
  Clapperboard,
  Film,
  ImagePlus,
  Images,
  Mic,
  Music,
  Palette,
  Rotate3d,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { VideoStudioContext } from '../types';
import { useEditorPool } from './GraphPoolPanel';
import { formatDuration, POOL_CHANGED_EVENT, PoolAssetCard } from './PoolAssetCard';
import {
  conceptById,
  conceptUpperUsd,
  generateRequest,
  MUSIC_MOODS,
  QUICK_START_CARDS,
  type QuickStartCard,
  type QuickStartForm,
  referenceImages,
  refsFromSelection,
  VOICE_PRESETS,
} from './quickStarts';

const CARD_ICON: Record<VideoEditorQuickStart, typeof ImagePlus> = {
  create_image: ImagePlus,
  restyle_image: Palette,
  edit_image: WandSparkles,
  storyboard_to_video: Clapperboard,
  keyframes_to_video: Images,
  rotate_360: Rotate3d,
  music_bed: Music,
  voiceover: Mic,
  headless_concept: Film,
};

const POLL_MS = 3_000;
/** A job still running past this is reported lost here; the Backend says the same at 15 min. */
const GIVE_UP_MS = 16 * 60_000;
const NONE = 'none';
const PROJECT_FORMAT = 'project';

type Status = VideoEditorOpOutput<'generate_status'>;
type Job = {
  jobId: string;
  card: QuickStartCard;
  startedAt: number;
  state: Status['state'];
  asset?: VideoEditorPoolAsset;
  clipId?: string;
  placedAtSec?: number;
  error?: string;
};

const isActive = (job: Job) => job.state === 'queued' || job.state === 'running';

// StyleFrame-style quick-start generation cards (left dock, Generate tab).
export function QuickStartPanel({ studio }: { studio: VideoStudioContext }): React.ReactNode {
  const [active, setActive] = useState<QuickStartCard | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const pool = useEditorPool(studio);
  const runOp = useRef(studio.runOp);
  runOp.current = studio.runOp;
  const refresh = useRef(studio.refresh);
  refresh.current = studio.refresh;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const polling = jobs.some(isActive);
  useEffect(() => {
    if (!polling) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const poll = window.setInterval(() => {
      for (const job of jobsRef.current.filter(isActive)) {
        const settle = (next: Partial<Job>) => {
          setJobs((current) =>
            current.map((entry) => (entry.jobId === job.jobId ? { ...entry, ...next } : entry)),
          );
          if (next.state === 'completed') {
            window.dispatchEvent(new Event(POOL_CHANGED_EVENT));
            if (next.clipId) void refresh.current();
          }
        };
        if (Date.now() - job.startedAt > GIVE_UP_MS) {
          settle({ state: 'failed', error: 'The generation stopped reporting.' });
          continue;
        }
        void runOp
          .current('generate_status', { jobId: job.jobId })
          .then((status) =>
            settle({
              state: status.state,
              ...(status.asset ? { asset: status.asset } : {}),
              ...(status.clipId ? { clipId: status.clipId } : {}),
              ...(status.error ? { error: status.error } : {}),
            }),
          )
          .catch(() => undefined); // a dropped poll is retried on the next tick
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [polling]);

  return (
    <div className="flex flex-col gap-3 p-2" data-testid="quick-start-panel">
      <div className="grid grid-cols-2 gap-2">
        {QUICK_START_CARDS.map((card) => {
          const Icon = CARD_ICON[card.id];
          return (
            <Card
              key={card.id}
              role="button"
              tabIndex={0}
              data-quick-start={card.id}
              className="cursor-pointer gap-1.5 py-2.5 transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setActive(card)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActive(card);
                }
              }}
            >
              <CardHeader className="gap-1 px-2.5">
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-primary" />
                  <Badge variant="muted" className="text-3xs capitalize">
                    {card.output}
                  </Badge>
                </div>
                <CardTitle className="text-xs">{card.label}</CardTitle>
                <CardDescription className="line-clamp-2 text-2xs">
                  {card.description}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {jobs.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            Results
          </h3>
          {jobs.map((job) => (
            <div
              key={job.jobId}
              className="space-y-1.5 rounded-md border border-border/60 p-2"
              data-generation-job={job.jobId}
              data-state={job.state}
            >
              <div className="flex items-center gap-2 text-2xs">
                {isActive(job) ? <Spinner className="size-3" /> : null}
                {job.state === 'failed' ? (
                  <TriangleAlert className="size-3 text-destructive" />
                ) : null}
                <span className="flex-1 truncate font-medium">{job.card.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {isActive(job)
                    ? `${job.state === 'queued' ? 'Queued' : 'Generating'} · ${formatDuration((now - job.startedAt) / 1_000)}`
                    : job.state === 'completed'
                      ? job.clipId && job.placedAtSec !== undefined
                        ? `Placed at ${formatDuration(job.placedAtSec)}`
                        : 'In the pool'
                      : 'Failed'}
                </span>
              </div>
              {job.asset ? <PoolAssetCard asset={job.asset} studio={studio} /> : null}
              {job.error ? (
                <p
                  className={
                    job.state === 'failed'
                      ? 'text-2xs text-destructive'
                      : 'text-2xs text-muted-foreground'
                  }
                >
                  {job.error}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {active ? (
        <QuickStartDialog
          key={active.id}
          card={active}
          studio={studio}
          pool={pool.assets ?? []}
          onClose={() => setActive(null)}
          onStart={async (input, placedAtSec) => {
            const started = await runOp.current('generate', input);
            setJobs((current) => [
              {
                jobId: started.jobId,
                card: active,
                startedAt: Date.now(),
                state: started.state,
                ...(placedAtSec === null ? {} : { placedAtSec }),
              },
              ...current,
            ]);
            setActive(null);
          }}
        />
      ) : null}
    </div>
  );
}

function QuickStartDialog({
  card,
  studio,
  pool,
  onClose,
  onStart,
}: {
  card: QuickStartCard;
  studio: VideoStudioContext;
  pool: readonly VideoEditorPoolAsset[];
  onClose: () => void;
  onStart: (
    input: Extract<ReturnType<typeof generateRequest>, { ok: true }>['input'],
    placedAtSec: number | null,
  ) => Promise<void>;
}): React.ReactNode {
  const stills = referenceImages(pool);
  const projectPreset = studio.project.exportSettings.presetId;
  const timelineSec = studio.project.durationSec;
  const [refs, setRefs] = useState<QuickStartForm['refs']>(() =>
    refsFromSelection(card, studio.project, studio.selection, pool),
  );
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState<string>(
    projectPreset && projectPreset in PLATFORM_EXPORT_PRESETS ? projectPreset : PROJECT_FORMAT,
  );
  const [place, setPlace] = useState(true);
  const [voice, setVoice] = useState('');
  // The field shows the timeline's length; left as shown, the bed follows the timeline.
  const [timelineLength] = useState(() =>
    timelineSec >= 1 ? String(Math.round(timelineSec * 10) / 10) : '',
  );
  const [length, setLength] = useState(timelineLength);
  const [duck, setDuck] = useState(true);
  const [concept, setConcept] = useState<HeadlessGrammar | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosenConcept = conceptById(concept);
  const upperUsd = chosenConcept ? conceptUpperUsd(chosenConcept) : null;
  const placeAtSec = place ? (card.placeFrom === 'start' ? 0 : studio.playheadSec) : null;

  const request = useMemo(
    () =>
      generateRequest(card, {
        refs,
        prompt,
        ...(format === PROJECT_FORMAT ? {} : { preset: format as PlatformExportPresetId }),
        placeAtSec,
        voice,
        ...(length.trim() && length !== timelineLength ? { durationSec: Number(length) } : {}),
        duck,
        ...(concept ? { concept } : {}),
      }),
    [card, refs, prompt, format, placeAtSec, voice, length, timelineLength, duck, concept],
  );
  const titles: Record<string, string> = Object.fromEntries([
    [NONE, 'None'],
    ...stills.map((asset) => [asset.assetId, asset.title]),
  ]);
  const formats: Record<string, string> = Object.fromEntries([
    [PROJECT_FORMAT, `Project (${studio.project.canvas.width}×${studio.project.canvas.height})`],
    ...Object.values(PLATFORM_EXPORT_PRESETS).map((preset) => [
      preset.id,
      `${preset.label} (${preset.width}×${preset.height})`,
    ]),
  ]);
  const paid = card.id === 'headless_concept';
  const start = () => {
    if (!request.ok) return;
    if (paid && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    onStart(request.input, placeAtSec).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not start the generation.');
      setBusy(false);
    });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        className="max-h-[90vh] max-w-md overflow-y-auto"
        data-testid="quick-start-dialog"
      >
        <DialogHeader>
          <DialogTitle>{card.label}</DialogTitle>
          <DialogDescription>{card.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {card.slots.length > 0 && stills.length === 0 ? (
            <p className="rounded-md border border-dashed p-2 text-2xs text-muted-foreground">
              No stills in this edit's pool yet. Wire images into the Video Editor node on the
              canvas, or make one with Create Image.
            </p>
          ) : null}
          {card.slots.map((slot) => (
            <div key={slot.role} className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <Label className="text-xs">
                {slot.label}
                {slot.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Select
                value={refs[slot.role] ?? NONE}
                onValueChange={(value) =>
                  setRefs((current) => ({
                    ...current,
                    [slot.role]: value === NONE ? undefined : value,
                  }))
                }
              >
                <SelectTrigger size="sm" className="w-full text-xs" aria-label={slot.label}>
                  <SelectValue items={titles} />
                </SelectTrigger>
                <SelectContent>
                  {slot.required ? null : (
                    <SelectItem value={NONE} className="text-xs">
                      None
                    </SelectItem>
                  )}
                  {stills.map((asset) => (
                    <SelectItem key={asset.assetId} value={asset.assetId} className="text-xs">
                      {asset.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {card.id === 'headless_concept' ? (
            <ConceptPicker
              value={concept}
              onChange={(next) => {
                setConcept(next);
                setConfirming(false);
              }}
            />
          ) : null}
          {card.id === 'music_bed' ? (
            <PresetChips
              label="Moods"
              presets={MUSIC_MOODS.map((mood) => ({
                key: mood.id,
                label: mood.label,
                value: mood.prompt,
              }))}
              current={prompt}
              onPick={setPrompt}
              dataAttribute="data-music-mood"
            />
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="quick-start-prompt" className="text-xs">
              {card.promptLabel ?? 'Prompt'}
              {card.promptRequired ? <span className="text-destructive"> *</span> : null}
            </Label>
            <Textarea
              id="quick-start-prompt"
              value={prompt}
              rows={card.id === 'voiceover' ? 4 : 3}
              placeholder={card.promptPlaceholder}
              className="text-xs"
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          {card.id === 'voiceover' ? (
            <div className="space-y-1.5">
              <Label htmlFor="quick-start-voice" className="text-xs">
                Voice and delivery
              </Label>
              <Input
                id="quick-start-voice"
                inputSize="sm"
                value={voice}
                placeholder="Warm, confident, Mexican Spanish"
                className="text-xs"
                onChange={(event) => setVoice(event.target.value)}
              />
              <PresetChips
                label="Voices"
                presets={VOICE_PRESETS.map((preset) => ({
                  key: preset,
                  label: preset,
                  value: preset,
                }))}
                current={voice}
                onPick={setVoice}
                dataAttribute="data-voice-preset"
              />
            </div>
          ) : null}
          {card.id === 'music_bed' ? (
            <>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label htmlFor="quick-start-length" className="text-xs">
                  Length (s)
                </Label>
                <Input
                  id="quick-start-length"
                  type="number"
                  inputSize="sm"
                  min={1}
                  max={600}
                  step={0.5}
                  value={length}
                  placeholder="Timeline length"
                  className="text-xs"
                  onChange={(event) => setLength(event.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="quick-start-duck" className="text-xs">
                  Duck under speech
                </Label>
                <Switch id="quick-start-duck" size="sm" checked={duck} onCheckedChange={setDuck} />
              </div>
            </>
          ) : null}
          {card.output === 'audio' ? null : (
            <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <Label className="text-xs">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger size="sm" className="w-full text-xs" aria-label="Format">
                  <SelectValue items={formats} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(formats).map(([id, label]) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="quick-start-place" className="text-xs">
              {card.placeFrom === 'start'
                ? 'Lay it under the edit from 0:00'
                : `Place at playhead (${formatDuration(studio.playheadSec)})`}
            </Label>
            <Switch id="quick-start-place" size="sm" checked={place} onCheckedChange={setPlace} />
          </div>
          {paid ? (
            <p
              className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-2xs"
              data-testid="concept-cost"
            >
              <CircleDollarSign className="size-3.5 shrink-0 text-amber-600" />
              {chosenConcept && upperUsd !== null
                ? `Up to $${upperUsd}: ${chosenConcept.beats.length} generated shots at up to $${upperUsd / chosenConcept.beats.length} each. A music bed or a voiceover costs cents.`
                : 'A concept reel generates several video shots: dollars, where a music bed or a voiceover costs cents.'}
            </p>
          ) : null}
          {error ? <p className="text-2xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          {request.ok ? null : (
            <p className="mr-auto self-center text-2xs text-muted-foreground">{request.reason}</p>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!request.ok || busy} onClick={start}>
            {busy ? <Spinner className="mr-1 size-3" /> : null}
            {paid
              ? confirming
                ? `Confirm, spend up to $${upperUsd}`
                : 'Generate reel'
              : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresetChips({
  label,
  presets,
  current,
  onPick,
  dataAttribute,
}: {
  label: string;
  presets: { key: string; label: string; value: string }[];
  current: string;
  onPick: (value: string) => void;
  dataAttribute: 'data-music-mood' | 'data-voice-preset';
}): React.ReactNode {
  return (
    <fieldset className="flex flex-wrap gap-1" aria-label={label}>
      {presets.map((preset) => (
        <Button
          key={preset.key}
          type="button"
          size="xs"
          variant={current === preset.value ? 'secondary' : 'outline'}
          aria-pressed={current === preset.value}
          className="text-2xs"
          {...{ [dataAttribute]: preset.key }}
          onClick={() => onPick(preset.value)}
        >
          {preset.label}
        </Button>
      ))}
    </fieldset>
  );
}

/** The headless concept catalog: what each reel is, and when it is the right one. */
function ConceptPicker({
  value,
  onChange,
}: {
  value: HeadlessGrammar | undefined;
  onChange: (value: HeadlessGrammar) => void;
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        Concept<span className="text-destructive"> *</span>
      </Label>
      <RadioGroup
        aria-label="Concept"
        value={value ?? null}
        onValueChange={(next) => onChange(next as HeadlessGrammar)}
        className="max-h-72 gap-1.5 overflow-y-auto pr-1"
        data-testid="concept-catalog"
      >
        {HEADLESS_CONCEPTS.map((concept) => (
          <Label
            key={concept.id}
            data-concept={concept.id}
            className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2 font-normal has-data-checked:border-primary/60 has-data-checked:bg-primary/5"
          >
            <RadioGroupItem value={concept.id} className="mt-0.5" />
            <span className="min-w-0 space-y-0.5">
              <span className="flex items-baseline justify-between gap-2 text-xs font-medium">
                {concept.label}
                <span className="text-3xs font-normal text-muted-foreground">
                  {conceptLengthRule(concept)}
                </span>
              </span>
              <span className="block text-2xs text-muted-foreground">{concept.summary}</span>
              <span className="block text-2xs">
                <span className="font-medium">When: </span>
                {concept.whenToUse}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

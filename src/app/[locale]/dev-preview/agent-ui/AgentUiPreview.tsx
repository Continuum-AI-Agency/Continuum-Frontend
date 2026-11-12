'use client';

// A simulated Jaina run driving every agent-ui component: the clock advances, the last call
// grows, variants finish and get scored, and a queued steering note is picked up after a beat.

import { type ReactNode, useEffect, useState } from 'react';
import { AgentRecap } from '@/components/agent-ui/AgentRecap';
import {
  AgentSteering,
  type SteeringNote,
  type SteeringStep,
} from '@/components/agent-ui/AgentSteering';
import { AwaySummary } from '@/components/agent-ui/AwaySummary';
import { ContextMap } from '@/components/agent-ui/ContextMap';
import { CostWaterfall } from '@/components/agent-ui/CostWaterfall';
import { JudgeBracket } from '@/components/agent-ui/JudgeBracket';
import type {
  Attempt,
  BracketMatch,
  ContextPart,
  RecapItem,
  RunSpan,
} from '@/components/agent-ui/model';
import { ParallelAttempts } from '@/components/agent-ui/ParallelAttempts';
import { TraceWaterfall } from '@/components/agent-ui/TraceWaterfall';

const TICK_MS = 500;
const RUN_END_MS = 41_000;

function useClock(): number {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTicks((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return ticks * TICK_MS;
}

function runSpans(nowMs: number): RunSpan[] {
  const clock = 26_000 + (nowMs % 20_000);
  const writing = clock < RUN_END_MS;
  return [
    {
      id: 'jaina',
      kind: 'agent',
      name: 'Jaina',
      detail: 'Why did CPA rise last week?',
      startMs: 0,
      endMs: writing ? undefined : RUN_END_MS,
      status: writing ? 'running' : 'ok',
    },
    {
      id: 'plan',
      parentId: 'jaina',
      kind: 'llm',
      name: 'Plan the answer',
      detail: 'Opus 5.5',
      startMs: 0,
      endMs: 3400,
      tokens: 6900,
      costUsd: 0.118,
      status: 'ok',
    },
    {
      id: 'meta',
      parentId: 'jaina',
      kind: 'tool',
      name: 'Meta insights',
      detail: 'analytics_query',
      startMs: 3400,
      endMs: 9800,
      tokens: 21_800,
      status: 'ok',
    },
    {
      id: 'google',
      parentId: 'jaina',
      kind: 'tool',
      name: 'Google Ads report',
      detail: 'analytics_query',
      startMs: 3500,
      endMs: 7100,
      tokens: 8200,
      status: 'ok',
    },
    {
      id: 'analyst',
      parentId: 'jaina',
      kind: 'agent',
      name: 'Analyst',
      detail: 'sub-agent',
      startMs: 9900,
      endMs: 24_600,
      status: 'ok',
    },
    {
      id: 'compare',
      parentId: 'analyst',
      kind: 'llm',
      name: 'Compare channels',
      detail: 'Sonnet 5.5',
      startMs: 10_000,
      endMs: 16_900,
      tokens: 31_200,
      costUsd: 0.094,
      status: 'ok',
    },
    {
      id: 'pacing',
      parentId: 'analyst',
      kind: 'tool',
      name: 'Pacing diagnostic',
      detail: 'optimizer_query',
      startMs: 17_000,
      endMs: 19_200,
      tokens: 3900,
      status: 'error',
    },
    {
      id: 'pacing-retry',
      parentId: 'analyst',
      kind: 'tool',
      name: 'Pacing diagnostic',
      detail: 'retry',
      startMs: 19_300,
      endMs: 21_800,
      tokens: 4100,
      status: 'ok',
    },
    {
      id: 'judge',
      parentId: 'analyst',
      kind: 'llm',
      name: 'Rank the causes',
      detail: 'Haiku 5.5',
      startMs: 21_900,
      endMs: 24_500,
      tokens: 5600,
      costUsd: 0.006,
      status: 'ok',
    },
    {
      id: 'write',
      parentId: 'jaina',
      kind: 'llm',
      name: 'Write the report',
      detail: 'Opus 5.5',
      startMs: 24_700,
      endMs: writing ? undefined : RUN_END_MS,
      // Like runForensics: a call's tokens and cost arrive when it finishes, not while it streams.
      tokens: writing ? undefined : 32_600,
      costUsd: writing ? undefined : 0.262,
      status: writing ? 'running' : 'ok',
    },
  ];
}

function contextParts(nowMs: number): ContextPart[] {
  const grow = Math.min(1, (nowMs % 20_000) / 20_000);
  return [
    { id: 'sys', kind: 'system', label: 'Jaina system prompt', tokens: 6200 },
    { id: 'tools', kind: 'tools', label: 'Tool schemas (14)', tokens: 14_800 },
    { id: 'brand', kind: 'memory', label: 'Brand memory', tokens: 3100 },
    { id: 'csv', kind: 'files', label: 'weekly-spend.csv', tokens: 9400 },
    { id: 'book', kind: 'files', label: 'brand-book.pdf', tokens: 12_000 },
    {
      id: 'chat',
      kind: 'history',
      label: 'Conversation',
      tokens: 18_000 + Math.round(grow * 14_000),
    },
    { id: 'meta', kind: 'results', label: 'Meta insights', tokens: 21_800 },
    { id: 'gads', kind: 'results', label: 'Google Ads report', tokens: 8200 },
  ];
}

function attempts(nowMs: number): Attempt[] {
  const t = (nowMs % 24_000) / 1000;
  const race = (
    id: string,
    label: string,
    model: string,
    approach: string,
    finishAt: number,
    score: number,
    costUsd: number,
  ): Attempt =>
    t >= finishAt
      ? { id, label, model, approach, status: 'done', score, costUsd, durationMs: finishAt * 1000 }
      : { id, label, model, approach, status: 'running', progress: t / finishAt };
  return [
    race('founder', 'Founder story', 'Veo 3.1', '9:16 · talking head', 9, 0.81, 1.92),
    race('hook', 'Bold hook', 'Kling 2.5', '9:16 · text-led', 6, 0.64, 0.88),
    race('ugc', 'UGC cut', 'Veo 3.1', '4:5 · testimonial', 14, 0.9, 2.1),
    t >= 4
      ? {
          id: 'price',
          label: 'Price-led',
          model: 'Kling 2.5',
          approach: '1:1 · offer',
          status: 'failed',
          error: 'Render timed out after 120s',
        }
      : {
          id: 'price',
          label: 'Price-led',
          model: 'Kling 2.5',
          approach: '1:1 · offer',
          status: 'running',
          progress: t / 8,
        },
  ];
}

const CLIPS = [
  {
    id: 'c1',
    label: 'Hook first',
    detail: 'Veo 3.1 · 15s',
    summary: 'Opens on the product in hand, price card at 4s, CTA at 13s.',
  },
  {
    id: 'c2',
    label: 'Problem / fix',
    detail: 'Kling 2.5 · 20s',
    summary: 'Spends 6s on the problem before the product appears.',
  },
  {
    id: 'c3',
    label: 'Founder',
    detail: 'Veo 3.1 · 18s',
    summary: 'Founder to camera, captions burned in, logo end card.',
  },
  {
    id: 'c4',
    label: 'Unboxing',
    detail: 'Kling 2.5 · 12s',
    summary: 'Tight unboxing, no voice, music-led.',
  },
  {
    id: 'c5',
    label: 'Testimonial',
    detail: 'Veo 3.1 · 22s',
    summary: 'Customer quote over b-roll, rating card mid-way.',
  },
  {
    id: 'c6',
    label: 'Side by side',
    detail: 'Kling 2.5 · 15s',
    summary: 'Before/after split screen, offer at the end.',
  },
  {
    id: 'c7',
    label: 'Offer led',
    detail: 'Veo 3.1 · 10s',
    summary: 'Price and urgency in the first second.',
  },
  {
    id: 'c8',
    label: 'Lifestyle',
    detail: 'Kling 2.5 · 25s',
    summary: 'Slow lifestyle montage, product at 9s.',
  },
];

const BRACKET: BracketMatch[][] = [
  [
    {
      a: 'c1',
      b: 'c2',
      winner: 'c1',
      reason:
        'Hook first shows the product at 0.4s; Problem / fix waits six seconds and loses the scroll.',
      scores: { c1: 8.4, c2: 6.1 },
    },
    {
      a: 'c3',
      b: 'c4',
      winner: 'c3',
      reason: 'The founder read is on-brand; the unboxing has no line that says what it is.',
      scores: { c3: 7.9, c4: 6.8 },
    },
    {
      a: 'c5',
      b: 'c6',
      winner: 'c6',
      reason: 'The split screen proves the claim; the testimonial runs long.',
      scores: { c5: 6.6, c6: 7.7 },
    },
    {
      a: 'c7',
      b: 'c8',
      winner: 'c7',
      reason: 'Offer led lands the price before the lifestyle cut shows the product.',
      scores: { c7: 7.4, c8: 5.2 },
    },
  ],
  [
    {
      a: 'c1',
      b: 'c3',
      winner: 'c1',
      reason: 'Both are clear, but Hook first gets to the product and the price faster.',
      scores: { c1: 8.6, c3: 8.0 },
    },
    { a: 'c6', b: 'c7' },
  ],
];

function recapItems(now: number): RecapItem[] {
  const hoursAgo = (h: number) => now - h * 3_600_000;
  return [
    {
      id: 'r1',
      at: hoursAgo(8.2),
      tone: 'done',
      title: 'Paused 2 fatigued ad sets',
      detail: 'Spring sale · Meta',
    },
    {
      id: 'r2',
      at: hoursAgo(7.4),
      tone: 'done',
      title: 'Shifted $120/day to PMax',
      detail: 'Always-on · Google',
    },
    {
      id: 'r3',
      at: hoursAgo(5.1),
      tone: 'needs',
      title: 'Raise Spring sale budget 20%',
      detail: 'ROAS 4.1 over 3 days',
      actionLabel: 'Approve',
    },
    {
      id: 'r4',
      at: hoursAgo(4.6),
      tone: 'failed',
      title: 'Google Ads sync failed',
      detail: 'Token expired',
      actionLabel: 'Reconnect',
    },
    {
      id: 'r5',
      at: hoursAgo(3.3),
      tone: 'done',
      title: 'Lowered bid cap to $18',
      detail: 'Retargeting · Meta',
    },
    {
      id: 'r6',
      at: hoursAgo(2.2),
      tone: 'needs',
      title: 'Launch 3 new creatives',
      detail: 'From the UGC test',
      actionLabel: 'Review',
    },
    {
      id: 'r7',
      at: hoursAgo(1.1),
      tone: 'done',
      title: 'Weekly report ready',
      detail: 'Jaina',
      actionLabel: 'Open',
    },
  ];
}

function useSteering() {
  const [steps, setSteps] = useState<SteeringStep[]>([
    { id: 'p1', label: 'Pull last week from Meta and Google', status: 'done' },
    { id: 'p2', label: 'Compare channel CPA', status: 'running' },
    { id: 'p3', label: 'Rank the causes', status: 'pending' },
    { id: 'p4', label: 'Write the report', status: 'pending' },
  ]);
  const [queued, setQueued] = useState<SteeringNote[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (queued.length === 0) return;
    const id = setTimeout(() => {
      const [note, ...rest] = queued;
      setQueued(rest);
      setSteps((prev) => {
        const at = prev.findIndex((s) => s.status === 'running') + 1;
        const next = prev.map((s, i) => (i === at - 1 ? { ...s, status: 'done' as const } : s));
        next.splice(at, 0, { id: note.id, label: note.text, status: 'running', fromNote: true });
        return next;
      });
    }, 2500);
    return () => clearTimeout(id);
  }, [queued]);

  return {
    steps,
    queued,
    running,
    onQueue: (text: string) => setQueued((prev) => [...prev, { id: `note-${Date.now()}`, text }]),
    onRemove: (note: SteeringNote) => setQueued((prev) => prev.filter((n) => n.id !== note.id)),
    onInterrupt: () => {
      setRunning(false);
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'failed' } : s)),
      );
    },
  };
}

export function AgentUiPreview() {
  const clock = useClock();
  const steering = useSteering();
  // Pinned after mount: a wall clock read during render would differ between server and client.
  const [now, setNow] = useState<number>();
  useEffect(() => setNow(Date.now()), []);
  if (now === undefined) return null;
  const spans = runSpans(clock);

  return (
    <main className="min-h-dvh bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <Section title="Run cost & time" note="Trace, spend and context for one Jaina run">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <TraceWaterfall spans={spans} nowMs={26_000 + (clock % 20_000)} />
            <CostWaterfall spans={spans} />
          </div>
          <ContextMap parts={contextParts(clock)} maxTokens={128_000} />
        </Section>
        <Section
          title="Variants & judging"
          note="One brief tried four ways, then judged two at a time"
        >
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <ParallelAttempts attempts={attempts(clock)} onUse={() => {}} />
            <JudgeBracket entrants={CLIPS} rounds={BRACKET} />
          </div>
        </Section>
        <Section title="While you were away" note="The overnight recap and its in-thread twin">
          <AgentRecap since={now - 9 * 3_600_000} until={now} items={recapItems(now)} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <AwaySummary
              since={now - 3.2 * 3_600_000}
              now={now}
              items={recapItems(now).slice(3)}
              onAction={() => {}}
            />
            <AgentSteering {...steering} />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{note}</p>
      </header>
      {children}
    </section>
  );
}

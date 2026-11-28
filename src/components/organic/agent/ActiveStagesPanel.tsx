'use client';

import { AlertCircleIcon, CheckCircle2Icon, CircleDotIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { TraceStep, type TraceStepStatus } from '@/components/chat/TraceStep';
import { Trace } from '@/components/ui/trace';
import {
  localizeOrganicAgentLabel,
  translateOrganicControlLabel,
} from '@/lib/ui/organicLifecycleLabels';
import type { PipelineStage, PipelineStageNode } from './types';

const STAGE_LABELS: Record<PipelineStage, string> = {
  strategist: 'Concept',
  concept: 'Concept',
  draft: 'Copy',
  blueprint: 'Preview',
  assets: 'Preview',
  quality: 'Fully fleshed out',
  merge: 'Fully fleshed out',
};

const TOTAL_STAGES = 7;

const STAGE_STATUS: Record<PipelineStageNode['status'], TraceStepStatus | undefined> = {
  pending: 'pending',
  active: 'running',
  done: undefined,
  failed: 'error',
};

function StageIcon({ status }: { status: PipelineStageNode['status'] }) {
  if (status === 'done') return <CheckCircle2Icon className="text-emerald-500/70" />;
  if (status === 'failed') return <AlertCircleIcon />;
  return <CircleDotIcon className={status === 'active' ? 'animate-pulse' : undefined} />;
}

type ActiveStagesPanelProps = {
  stages: PipelineStageNode[];
  isStreaming: boolean;
};

export function ActiveStagesPanel({ stages, isStreaming }: ActiveStagesPanelProps) {
  const uiText = useTranslations('organic');
  const commonText = useTranslations('common');
  if (!isStreaming || stages.length === 0) return null;

  const doneCount = stages.filter((s) => s.status === 'done').length;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="mt-0.5 space-y-1 px-3 pb-1"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <span className="font-mono">{uiText('pipeline_37e1c77')}</span>
          <span className="tabular-nums">
            {doneCount}/{TOTAL_STAGES}
          </span>
        </div>
        <Trace className="gap-1">
          {stages.map((node) => (
            <TraceStep
              key={node.stage}
              status={STAGE_STATUS[node.status]}
              icon={<StageIcon status={node.status} />}
              title={`${localizeOrganicAgentLabel(node.agentName, commonText) ?? translateOrganicControlLabel(STAGE_LABELS[node.stage], commonText)} · ${translateOrganicControlLabel(STAGE_LABELS[node.stage], commonText)}`}
            />
          ))}
        </Trace>
      </motion.div>
    </AnimatePresence>
  );
}

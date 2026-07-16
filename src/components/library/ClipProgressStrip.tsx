'use client';

import { AlertCircle, Check, Loader2, Scissors } from 'lucide-react';
import { motion } from 'motion/react';
import { ViralityScoreBadge } from '@/components/virality/ViralityScoreBadge';
import { cn } from '@/lib/utils';
import type { ClipGenerationProgress } from './hooks/useGenerateClips';

// Stateless per-card clip-generation strip: a stage pill while the backend plans,
// then one pill per section as the browser cuts. Modeled on UploadStrip.
export function ClipProgressStrip({ progress }: { progress: ClipGenerationProgress }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-wrap items-center gap-1.5"
    >
      {progress.stageLabel ? (
        <span className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin" />
          {progress.stageLabel}
        </span>
      ) : null}
      {progress.sections.map((section) => (
        <span
          key={section.index}
          className={cn(
            'flex items-center gap-1 rounded-lg border px-2 py-1 text-xs',
            section.status === 'pending' && 'border-border/50 bg-muted/40 text-muted-foreground/70',
            section.status === 'active' && 'border-border/60 bg-muted/60 text-muted-foreground',
            section.status === 'done' &&
              'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            section.status === 'error' &&
              'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
          )}
          title={section.title}
        >
          {section.status === 'active' && <Loader2 className="size-2.5 shrink-0 animate-spin" />}
          {section.status === 'done' && <Check className="size-2.5 shrink-0" />}
          {section.status === 'error' && <AlertCircle className="size-2.5 shrink-0" />}
          {section.status === 'pending' && <Scissors className="size-2.5 shrink-0" />}
          <span className="max-w-[90px] truncate">{section.title}</span>
          <ViralityScoreBadge
            overall={section.viralityOverall ?? null}
            grade={section.viralityGrade ?? null}
            className="ml-0.5"
          />
        </span>
      ))}
    </motion.div>
  );
}

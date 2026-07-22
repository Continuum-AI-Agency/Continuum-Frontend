'use client';

import { motion } from 'motion/react';
import type { ToolResultEventData } from '@/lib/jaina/schemas';

type SpawnWorkerOutput = {
  agent_id?: string;
  task_id?: string;
  status?: string;
  evidence?: string[];
  insights?: string[];
  recommendations?: string[];
};

function InsightSection({
  label,
  items,
  labelClass,
  bulletClass,
}: {
  label: string;
  items: string[];
  labelClass: string;
  bulletClass: string;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className={`text-2xs font-medium uppercase tracking-wide ${labelClass}`}>{label}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 text-xs text-foreground/75">
            <span className={`shrink-0 ${bulletClass}`}>·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type WorkerInsightsPanelProps = {
  results: ToolResultEventData[];
};

export function WorkerInsightsPanel({ results }: WorkerInsightsPanelProps) {
  const workers = results
    .map((r) => r.output as SpawnWorkerOutput | undefined)
    .filter((o): o is SpawnWorkerOutput => !!o && typeof o === 'object');

  const hasContent = workers.some(
    (w) =>
      (w.evidence?.length ?? 0) > 0 ||
      (w.insights?.length ?? 0) > 0 ||
      (w.recommendations?.length ?? 0) > 0,
  );

  if (!hasContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5"
    >
      {workers.map((worker, i) => {
        const sections = [
          {
            label: 'Evidence',
            items: worker.evidence ?? [],
            labelClass: 'text-muted-foreground/70',
            bulletClass: 'text-muted-foreground/40',
          },
          {
            label: 'Insights',
            items: worker.insights ?? [],
            labelClass: 'text-amber-500/80',
            bulletClass: 'text-amber-500/60',
          },
          {
            label: 'Recommendations',
            items: worker.recommendations ?? [],
            labelClass: 'text-[#5A48F9]/80',
            bulletClass: 'text-[#5A48F9]/60',
          },
        ].filter((s) => s.items.length > 0);

        if (!sections.length) return null;

        return (
          <div key={i} className="flex flex-col gap-2">
            {worker.agent_id && (
              <p className="text-2xs text-muted-foreground/50 font-mono">
                {worker.agent_id}
                {worker.task_id ? ` · ${worker.task_id}` : ''}
              </p>
            )}
            {sections.map((s) => (
              <InsightSection
                key={s.label}
                label={s.label}
                items={s.items}
                labelClass={s.labelClass}
                bulletClass={s.bulletClass}
              />
            ))}
          </div>
        );
      })}
    </motion.div>
  );
}

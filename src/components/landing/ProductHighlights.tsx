'use client';

import { BarChartIcon, LayersIcon, MagicWandIcon } from '@radix-ui/react-icons';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import GlassCard from '../ui/GlassCard';

const panels = [
  {
    value: 'social',
    label: 'Social+',
    icon: MagicWandIcon,
    kicker: 'Campaign-ready in minutes',
    headline: 'AI ideation, channel-ready copy, and scheduled handoffs',
    bullets: [
      'Pull trending topics with context from brand voice',
      'Draft captions, video scripts, and asset briefs in one click',
      'Approve and schedule to every connected channel at once',
    ],
    cta: { label: 'Start now', href: '/onboarding' },
  },
  {
    value: 'performance',
    label: 'Performance+',
    icon: BarChartIcon,
    kicker: 'Unify performance intelligence',
    headline: 'Launch paid campaigns with guardrails and anomaly alerts',
    bullets: [
      'Spin up campaigns from AI trend analysis and budget templates',
      'Sync creative variations, audiences, and pacing in a single workflow',
      'Receive SLA-aware alerts the moment spend or CPA drifts',
    ],
    cta: { label: 'Contact sales', href: 'mailto:hello@continuum.ai' },
  },
  {
    value: 'studio',
    label: 'Studio+',
    icon: LayersIcon,
    kicker: 'Accelerate brand visuals',
    headline: 'Frontier multimodal models, prompt templates, and brand style guides',
    bullets: [
      'Pay‑as‑you‑go add‑on for any module',
      'Central library with rights tracking and collaborative notes',
      'Drop assets straight into organic or paid playbooks',
    ],
    cta: { label: 'Contact sales', href: 'mailto:hello@continuum.ai' },
  },
];

export function ProductHighlights() {
  const [active, setActive] = useState(panels[0].value);

  return (
    <div id="product" className="relative">
      <div className="mx-auto w-full max-w-4xl py-20">
        <div className="flex flex-col gap-8">
          <div>
            <Pill className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-200">
              One system, three accelerators
            </Pill>
            <h2 className="mt-3 text-2xl font-bold">Everything Alex needs without jumping tabs</h2>
            <span className="mt-2 max-w-2xl text-lg text-muted-foreground">
              Toggle between Continuum&apos;s core modules to see how workflows stay orchestrated
              from planning to launch.
            </span>
          </div>

          <TabsPrimitive.Root
            value={active}
            onValueChange={setActive}
            className="flex flex-col gap-6"
          >
            <TabsPrimitive.List className="w-full overflow-x-auto">
              <div className="flex gap-3 flex-wrap">
                {panels.map((panel) => (
                  <TabsPrimitive.Trigger
                    key={panel.value}
                    value={panel.value}
                    className="rounded-full px-4 py-2 text-sm font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <panel.icon className="h-4 w-4" />
                      <span className="capitalize">{panel.label}</span>
                    </div>
                  </TabsPrimitive.Trigger>
                ))}
              </div>
            </TabsPrimitive.List>

            <AnimatePresence mode="wait">
              {panels.map((panel) => (
                <TabsPrimitive.Content
                  key={panel.value}
                  value={panel.value}
                  className="focus:outline-none"
                >
                  {active === panel.value ? (
                    <motion.div
                      key={panel.value}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3 }}
                    >
                      <GlassCard className="p-6">
                        <div className="flex flex-col md:flex-row gap-8">
                          <div className="md:w-7/12">
                            <span className="uppercase tracking-wide text-slate-500 dark:text-slate-300 text-sm">
                              {panel.kicker}
                            </span>
                            <h3 className="mt-2 leading-snug text-xl font-bold">
                              {panel.headline}
                            </h3>
                            <div className="mt-5 space-y-3">
                              {panel.bullets.map((bullet) => (
                                <span
                                  key={bullet}
                                  className="flex items-start gap-2 text-left text-slate-600 dark:text-slate-200 text-base"
                                >
                                  <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
                                  <span>{bullet}</span>
                                </span>
                              ))}
                            </div>
                            <div className="mt-6">
                              <Button
                                asChild
                                variant={panel.value === 'social' ? 'default' : 'outline'}
                              >
                                <Link href={panel.cta.href}>{panel.cta.label}</Link>
                              </Button>
                            </div>
                          </div>
                          <div className="md:w-5/12">
                            <div
                              className="h-48 rounded-xl border border-dashed border-slate-300/60 bg-white/50 dark:border-slate-600/60 dark:bg-slate-800/60"
                              aria-hidden
                            >
                              <div className="flex items-center justify-center h-full text-sm text-slate-500 dark:text-slate-300">
                                Module preview
                              </div>
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ) : null}
                </TabsPrimitive.Content>
              ))}
            </AnimatePresence>
          </TabsPrimitive.Root>
        </div>
      </div>
    </div>
  );
}

export default ProductHighlights;

'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { Pill } from '@/components/kibo-ui/pill';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import GradientText from '../ui/GradientText';
import { KpiGraph } from './KpiGraph';

const stats = [
  { label: 'Connect every platform', value: 'Under 5 minutes' },
  { label: 'Produce a full content week', value: '90% faster' },
  { label: 'Monitor organic + paid', value: 'One unified dashboard' },
];

export function HeroSection() {
  return (
    <div className="relative overflow-hidden bg-white/60 dark:bg-slate-900/40">
      <div className="mx-auto w-full max-w-4xl py-20 md:py-24">
        <div className="flex flex-col md:flex-row gap-12 items-center">
          <div className="w-full md:w-6/12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Pill className="mb-4 rounded-full bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary">
                Hybrid Stripe × Modern Treasury polish
              </Pill>
              <h1 className="tracking-tight leading-tight text-6xl font-bold">
                <GradientText>Ship CEO‑grade content and campaigns 10× faster</GradientText>
              </h1>
              <span className="mt-4 max-w-xl text-lg text-muted-foreground">
                Continuum is your AI copilot for social, performance, and creative—unifying trends,
                generation, and publishing into one workflow.
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.5 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Link
                href="/onboarding"
                className={cn(buttonVariants({ size: 'lg' }), 'min-w-[200px]')}
              >
                Start now
              </Link>
              <Link
                href="mailto:hello@continuum.ai"
                className={buttonVariants({ size: 'lg', variant: 'outline' })}
              >
                Contact sales
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mt-10 grid gap-6 sm:grid-cols-3"
            >
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-white/30 bg-white/70 p-4 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold">{stat.value}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="w-full md:w-6/12">
            <div className="flex flex-col gap-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.18, duration: 0.5 }}
              >
                <div className="relative rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
                  <div
                    className="h-64 w-full rounded-xl border border-dashed border-slate-300/60 bg-white/60 dark:border-slate-600/60 dark:bg-slate-800/60"
                    aria-hidden
                  >
                    <div className="flex items-center justify-center h-full text-sm text-slate-500 dark:text-slate-300">
                      Feature walkthrough video placeholder
                    </div>
                  </div>
                  <span className="mt-4 text-sm text-muted-foreground">
                    Drop in the interactive demo or product reel here when assets are ready.
                  </span>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.6 }}
              >
                <KpiGraph />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HeroSection;

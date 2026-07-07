'use client';

import Link from 'next/link';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function PricingSection() {
  return (
    <div id="subscribe" className="relative">
      <div className="mx-auto w-full max-w-4xl py-20">
        <div className="flex flex-col gap-8 items-start">
          <h2 className="text-2xl font-bold">Transparent pricing that scales with your momentum</h2>
          <span className="max-w-2xl text-base text-muted-foreground">
            Launch today with a flat monthly plan for organic orchestration. Add paid media and
            high-touch renders once you are ready for bespoke performance campaigns.
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            <div className="border border-white/40 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex flex-col gap-4">
                <span className="uppercase tracking-wide text-slate-500 dark:text-slate-300 text-sm">
                  Social+
                </span>
                <Tabs defaultValue="monthly">
                  <TabsList>
                    <TabsTrigger value="monthly">Monthly</TabsTrigger>
                    <TabsTrigger value="annual">Annual</TabsTrigger>
                  </TabsList>
                  <TabsContent value="monthly">
                    <h3 className="text-3xl font-bold">
                      $300<span className="text-base font-medium">/mo</span>
                    </h3>
                  </TabsContent>
                  <TabsContent value="annual">
                    <h3 className="text-3xl font-bold">
                      $3,000<span className="text-base font-medium">/yr</span>{' '}
                      <Pill variant="success">2 months free</Pill>
                    </h3>
                    <span className="text-sm text-muted-foreground">Save $600 annually</span>
                  </TabsContent>
                </Tabs>
                <span className="text-base text-muted-foreground">
                  Unlimited organic channels, AI content drafting, scheduling, and analytics in one
                  workspace.
                </span>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-200">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
                    <span>Connect unlimited social profiles with OAuth sync</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
                    <span>Generate and approve a full week of posts in minutes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
                    <span>Single dashboard for performance and anomaly alerts</span>
                  </li>
                </ul>
                <Button size="lg" asChild className="mt-2">
                  <Link href="/onboarding">Start now</Link>
                </Button>
              </div>
            </div>

            <div className="border border-slate-300/60 bg-slate-100/60 p-8 shadow-sm backdrop-blur dark:border-slate-600/60 dark:bg-slate-800/60">
              <div className="flex flex-col gap-4">
                <span className="uppercase tracking-wide text-slate-600 dark:text-slate-300 text-sm">
                  Performance+ & Studio+ (rendering)
                </span>
                <h3 className="text-xl font-bold">Custom pricing</h3>
                <span className="text-base text-muted-foreground">
                  Unlock paid media orchestration and premium render packages tailor-made for your
                  growth stage.
                </span>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-200">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    <span>Joint planning workshop with your team</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    <span>Agentic budget pacing and creative experimentation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    <span>Reserved access to Continuum&apos;s render studio</span>
                  </li>
                </ul>
                <Button size="lg" variant="outline" asChild>
                  <Link href="mailto:hello@continuum.ai">Contact sales</Link>
                </Button>
                <span className="mt-2 text-sm text-muted-foreground">
                  Studio+ (frontier multimodal, prompt templates, brand integrations) is a
                  pay‑as‑you‑go add‑on to any module.
                </span>
              </div>
            </div>
          </div>

          <span className="text-slate-500 dark:text-slate-300 text-sm">
            Need procurement paperwork or enterprise security review? Email us at{' '}
            <a href="mailto:hello@continuum.ai" className="underline">
              hello@continuum.ai
            </a>
            .
          </span>
        </div>
      </div>
    </div>
  );
}

export default PricingSection;

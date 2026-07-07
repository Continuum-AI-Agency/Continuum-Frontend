'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqItems = [
  {
    value: 'onboarding',
    header: 'How fast can we connect all of our channels?',
    content:
      'Continuum guides you through OAuth connections for every supported network and writes smart defaults for permissions. Most teams are uploading brand voice context and shipping their first calendar within the first 5 minutes.',
  },
  {
    value: 'security',
    header: 'What guardrails keep campaigns compliant?',
    content:
      'All campaign workflows enforce approval steps, brand voice constraints, and audit logs. Role-based access ensures only designated operators can push paid media live.',
  },
  {
    value: 'pricing',
    header: 'How is Social+ priced?',
    content:
      'Social+ is $300 per month or $3,000 per year (2 months free). Studio+ is a pay‑as‑you‑go add‑on. Performance+ and Studio+ (rendering) are available via Contact sales.',
  },
  {
    value: 'demo',
    header: 'Can I try the platform before I commit?',
    content:
      'Yes. Book the walkthrough to access a guided sandbox and an interactive dashboard demo. Stripe hooks will unlock self-serve billing once we flip the switch.',
  },
  {
    value: 'support',
    header: 'Do you support enterprise rollouts?',
    content:
      'Yes. We support procurement, SSO, and enterprise security review. Reach us at hello@continuum.ai to kick off.',
  },
];

export function FAQSection() {
  return (
    <div className="relative">
      <div className="mx-auto w-full max-w-4xl py-20">
        <h2 className="text-2xl font-bold">FAQs</h2>
        <span className="mt-2 max-w-2xl text-base text-muted-foreground">
          Honest, transparent answers so you can move quickly.
        </span>
        <div className="mt-6 rounded-xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionTrigger className="text-left">{item.header}</AccordionTrigger>
                <AccordionContent>{item.content}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

export default FAQSection;

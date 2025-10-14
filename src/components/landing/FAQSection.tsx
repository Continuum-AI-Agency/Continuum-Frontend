"use client";

import { Box, Container, Heading, Text } from "@radix-ui/themes";
import { Accordion } from "../ui/Accordion";

const faqItems = [
  {
    value: "onboarding",
    header: "How fast can we connect all of our channels?",
    content:
      "Continuum guides you through OAuth connections for every supported network and writes smart defaults for permissions. Most teams are uploading brand voice context and shipping their first calendar within the first 5 minutes.",
  },
  {
    value: "security",
    header: "What guardrails keep campaigns compliant?",
    content:
      "All campaign workflows enforce approval steps, brand voice constraints, and audit logs. Role-based access ensures only designated operators can push paid media live.",
  },
  {
    value: "demo",
    header: "Can I try the platform before I commit?",
    content:
      "Yes. Book the walkthrough to access a guided sandbox and an interactive dashboard demo. Stripe hooks will unlock self-serve billing once we flip the switch.",
  },
];

export function FAQSection() {
  return (
    <Box className="relative">
      <Container size="3" className="py-20">
        <Heading size="6">FAQs</Heading>
        <Text size="3" color="gray" className="mt-2 max-w-2xl">
          Honest, transparent answers so you can move quickly.
        </Text>
        <Box className="mt-6 rounded-xl border border-white/40 bg-white/70 p-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
          <Accordion items={faqItems} />
        </Box>
      </Container>
    </Box>
  );
}

export default FAQSection;

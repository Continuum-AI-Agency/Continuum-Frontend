"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Container, Flex, Badge, Heading, Text, Tabs } from "@radix-ui/themes";
import GlassCard from "../ui/GlassCard";
import { MagicWandIcon, BarChartIcon, LayersIcon } from "@radix-ui/react-icons";

const panels = [
  {
    value: "organic",
    label: "Organic content",
    icon: MagicWandIcon,
    kicker: "Campaign-ready in minutes",
    headline: "AI ideation, channel-ready copy, and scheduled handoffs",
    bullets: [
      "Pull trending topics with context from brand voice",
      "Draft captions, video scripts, and asset briefs in one click",
      "Approve and schedule to every connected channel at once",
    ],
  },
  {
    value: "paid",
    label: "Paid media",
    icon: BarChartIcon,
    kicker: "Unify performance intelligence",
    headline: "Launch paid campaigns with guardrails and anomaly alerts",
    bullets: [
      "Spin up campaigns from AI trend analysis and budget templates",
      "Sync creative variations, audiences, and pacing in a single workflow",
      "Receive SLA-aware alerts the moment spend or CPA drifts",
    ],
  },
  {
    value: "creative",
    label: "Creative studio",
    icon: LayersIcon,
    kicker: "Accelerate brand visuals",
    headline: "Generate on-brand visuals and manage your asset library",
    bullets: [
      "AI prompt generator tuned to your brand identity",
      "Central library with rights tracking and collaborative notes",
      "Drop assets straight into organic or paid playbooks",
    ],
  },
];

export function ProductHighlights() {
  const [active, setActive] = useState(panels[0].value);

  return (
    <Box className="relative">
      <Container size="3" className="py-20">
        <Flex direction="column" gap="6">
          <Box>
            <Badge size="2" color="purple" className="rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-200">
              One system, three accelerators
            </Badge>
            <Heading size="6" className="mt-3">Everything Alex needs without jumping tabs</Heading>
            <Text size="4" color="gray" className="mt-2 max-w-2xl">
              Toggle between Continuum&apos;s core modules to see how workflows stay orchestrated from planning to launch.
            </Text>
          </Box>

          <Tabs.Root value={active} onValueChange={setActive} className="flex flex-col gap-6">
            <Tabs.List color="purple" className="w-full overflow-x-auto">
              <Flex gap="3" wrap="wrap">
                {panels.map((panel) => (
                  <Tabs.Trigger key={panel.value} value={panel.value} className="rounded-full px-4 py-2 text-sm font-medium">
                    <Flex align="center" gap="2">
                      <panel.icon className="h-4 w-4" />
                      <span className="capitalize">{panel.label}</span>
                    </Flex>
                  </Tabs.Trigger>
                ))}
              </Flex>
            </Tabs.List>

            <AnimatePresence mode="wait">
              {panels.map((panel) => (
                <Tabs.Content key={panel.value} value={panel.value} forceMount className="focus:outline-none">
                  {active === panel.value ? (
                    <motion.div
                      key={panel.value}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3 }}
                    >
                      <GlassCard className="p-6">
                        <Flex direction={{ initial: "column", md: "row" }} gap="6">
                          <Box className="md:w-7/12">
                            <Text size="2" color="gray" className="uppercase tracking-wide text-slate-500 dark:text-slate-300">
                              {panel.kicker}
                            </Text>
                            <Heading size="5" className="mt-2 leading-snug">
                              {panel.headline}
                            </Heading>
                            <Box className="mt-5 space-y-3">
                              {panel.bullets.map((bullet) => (
                                <Text key={bullet} size="3" color="gray" className="flex items-start gap-2 text-left text-slate-600 dark:text-slate-200">
                                  <span className="mt-1 h-2 w-2 rounded-full bg-purple-500" />
                                  <span>{bullet}</span>
                                </Text>
                              ))}
                            </Box>
                          </Box>
                          <Box className="md:w-5/12">
                            <div className="h-48 rounded-xl border border-dashed border-slate-300/60 bg-white/50 dark:border-slate-600/60 dark:bg-slate-800/60" aria-hidden>
                              <Flex align="center" justify="center" className="h-full text-sm text-slate-500 dark:text-slate-300">
                                Future module still preview frame
                              </Flex>
                            </div>
                          </Box>
                        </Flex>
                      </GlassCard>
                    </motion.div>
                  ) : null}
                </Tabs.Content>
              ))}
            </AnimatePresence>
          </Tabs.Root>
        </Flex>
      </Container>
    </Box>
  );
}

export default ProductHighlights;

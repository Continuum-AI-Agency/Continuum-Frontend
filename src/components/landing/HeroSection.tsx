"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Box, Container, Flex, Heading, Text, Button, Badge } from "@radix-ui/themes";
import GradientText from "../ui/GradientText";
import { KpiGraph } from "./KpiGraph";

const stats = [
  { label: "Connect every platform", value: "Under 5 minutes" },
  { label: "Produce a full content week", value: "90% faster" },
  { label: "Monitor organic + paid", value: "One unified dashboard" },
];

export function HeroSection() {
  return (
    <Box className="relative overflow-hidden bg-white/60 dark:bg-slate-900/40">
      <Container size="3" className="py-20 md:py-24">
        <Flex direction={{ initial: "column", md: "row" }} gap="8" align="center">
          <Box className="w-full md:w-6/12">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge size="2" color="purple" className="mb-4 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-200">
                AI co-pilot for campaign velocity
              </Badge>
              <Heading size="9" className="tracking-tight leading-tight">
                <GradientText>Ship cross-platform stories before trends peak</GradientText>
              </Heading>
              <Text size="4" color="gray" className="mt-4 max-w-xl">
                Continuum pulls every social, paid, and creative workflow into a single AI command center so Alex and team stay ahead of the feed with clarity and speed.
              </Text>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.5 }} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="3" asChild data-stripe-plan="organic-monthly" className="min-w-[200px]">
                <Link href="#subscribe">Start for $300/month</Link>
              </Button>
              <Button size="3" variant="outline" asChild>
                <Link href="#book-demo">Book a 15-minute walkthrough</Link>
              </Button>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="mt-10 grid gap-6 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-white/30 bg-white/70 p-4 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">{stat.label}</p>
                  <p className="mt-2 text-lg font-semibold">{stat.value}</p>
                </div>
              ))}
            </motion.div>
          </Box>

          <Box className="w-full md:w-6/12">
            <Flex direction="column" gap="6">
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, duration: 0.5 }}>
                <Box className="relative rounded-2xl border border-white/40 bg-white/70 p-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
                  <div className="h-64 w-full rounded-xl border border-dashed border-slate-300/60 bg-white/60 dark:border-slate-600/60 dark:bg-slate-800/60" aria-hidden>
                    <Flex align="center" justify="center" className="h-full text-sm text-slate-500 dark:text-slate-300">
                      Feature walkthrough video placeholder
                    </Flex>
                  </div>
                  <Text size="2" color="gray" className="mt-4">
                    Drop in the interactive demo or product reel here when assets are ready.
                  </Text>
                </Box>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6 }}>
                <KpiGraph />
              </motion.div>
            </Flex>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
}

export default HeroSection;

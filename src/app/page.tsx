"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, type Variants, LayoutGroup } from "framer-motion";
import GradientText from "../components/ui/GradientText";
import GlassCard from "../components/ui/GlassCard";
import SiteHeader from "../components/site/SiteHeader";
import SiteFooter from "../components/site/SiteFooter";
import { MotionBox } from "../components/ui/Motion";
import { Box, Section, Flex, Grid, Heading, Text, Button, Badge, Separator, TextField, Card } from "@radix-ui/themes";
import {
  Link2Icon,
  MagicWandIcon,
  BarChartIcon,
} from "@radix-ui/react-icons";

export const dynamic = "force-static";

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut", delay: custom },
  }),
};

const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

export default function Home() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const featureCards = [
    {
      icon: Link2Icon,
      title: "Connect platforms in minutes",
      description:
        "Onboard all social accounts and set up your brand profile under 5 minutes.",
      details: [
        "Secure OAuth and granular permissions",
        "Smart defaults you can edit anytime",
        "Deterministic retries when tokens expire",
      ],
      delay: 0.05,
    },
    {
      icon: MagicWandIcon,
      title: "Generate content at scale",
      description:
        "AI-assisted ideation, writing, and scheduling powered by trend analysis.",
      details: [
        "Prompt presets aligned to channels",
        "Brand voice and compliance guardrails",
        "Scheduling with fallbacks and approvals",
      ],
      delay: 0.12,
    },
    {
      icon: BarChartIcon,
      title: "Launch and monitor campaigns",
      description:
        "Create, launch, and track paid + organic across channels from one place.",
      details: [
        "Unified analytics and attribution",
        "Anomaly alerts and SLA-aware retries",
        "Shared dashboards for teams",
      ],
      delay: 0.19,
    },
  ];

  return (
    <main>
      <SiteHeader />
      <Section size="3" className="p-0">
        <Grid columns={{ initial: "1", md: "12" }} gap="8" className="min-h-[80dvh] items-center">
          {/* Left: Auth (now primary) */}
          <Box className="md:col-span-5">
            <MotionBox>
              <Heading size="7" className="tracking-tight mb-2"><GradientText>Welcome back</GradientText></Heading>
              <Text size="3" color="gray">Sign in to your account to continue</Text>
              <Box my="4" className="max-w-[520px]">
                <Grid gap="3">
                  <Button size="3" variant="soft" asChild>
                    <Link href="#oauth-google">Continue with Google</Link>
                  </Button>
                  <Button size="3" variant="soft" asChild>
                    <Link href="#oauth-github">Continue with GitHub</Link>
                  </Button>
                  <Separator my="3" size="4" />
                  <Grid gap="3">
                    <Text size="2" color="gray">Or use your email</Text>
                    <GlassCard>
                      <Flex direction="column" gap="3" p="3">
                        <label className="text-sm">Email</label>
                        <TextField.Root size="3" type="email" placeholder="you@company.com" />
                        <label className="text-sm">Password</label>
                        <TextField.Root size="3" type="password" placeholder="••••••••" />
                        <Button size="3">Sign in</Button>
                      </Flex>
                    </GlassCard>
                  </Grid>
                </Grid>
              </Box>
              <Text size="2" color="gray">By continuing you agree to our Terms and Privacy.</Text>
            </MotionBox>
          </Box>

          {/* Right: Hero + value props */}
          <Box className="md:col-span-7">
            <MotionBox>
              <motion.div variants={fadeInUp}>
                <Heading size="8" className="tracking-tight leading-tight"><GradientText>Your AI command center</GradientText></Heading>
              </motion.div>
              <motion.div variants={fadeInUp}>
                <Text size="4" color="gray">Connect platforms, generate content, and launch campaigns — all in one place.</Text>
              </motion.div>

              {/* Value proposition cards with expand */}
              <LayoutGroup>
                <Grid columns={{ initial: "1", sm: "3" }} gap="4" my="5">
                  {featureCards.map(({ icon: Icon, title, description, details, delay }) => (
                    <motion.div key={title} variants={fadeInUp} custom={delay}>
                      <Card asChild size="3" className="cursor-pointer">
                        <motion.div
                          layout
                          layoutId={title}
                          onClick={() => setExpanded(expanded === title ? null : title)}
                          transition={{ layout: { duration: 0.35, ease: "easeOut" } }}
                        >
                          <Flex direction="column" gap="3">
                            <Flex align="center" gap="2">
                              <Box className="rounded-full p-2 bg-white/40 dark:bg-white/10">
                                <Icon width={20} height={20} />
                              </Box>
                              <Heading size="4">{title}</Heading>
                            </Flex>
                            <Text color="gray" size="3">{description}</Text>
                            {expanded === title && (
                              <Box className="pt-2">
                                {details.map((d: string) => (
                                  <Text key={d} size="2" color="gray" as="p" className="leading-relaxed">• {d}</Text>
                                ))}
                              </Box>
                            )}
                          </Flex>
                        </motion.div>
                      </Card>
                    </motion.div>
                  ))}
                </Grid>
              </LayoutGroup>
            </MotionBox>
          </Box>

          
        </Grid>
      </Section>
      <SiteFooter />

      {/* Below-the-fold sections removed per one-page non-scroll requirement */}
    </main>
  );
}
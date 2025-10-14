import Link from "next/link";
import { Box, Container, Flex, Grid, Heading, Text, Card, Button } from "@radix-ui/themes";

export function PricingSection() {
  return (
    <Box id="subscribe" className="relative">
      <Container size="3" className="py-20">
        <Flex direction="column" gap="6" align="start">
          <Heading size="6">Transparent pricing that scales with your momentum</Heading>
          <Text size="3" color="gray" className="max-w-2xl">
            Launch today with a flat monthly plan for organic orchestration. Add paid media and high-touch renders once you are ready for bespoke performance campaigns.
          </Text>

          <Grid columns={{ initial: "1", md: "2" }} gap="6" className="w-full">
            <Card className="border border-white/40 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-slate-900/70">
              <Flex direction="column" gap="4">
                <Text size="2" color="gray" className="uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Organic launchpad
                </Text>
                <Heading size="7">$300<span className="text-base font-medium">/month</span></Heading>
                <Text size="3" color="gray">
                  Unlimited organic channels, AI content drafting, scheduling, and analytics in one workspace.
                </Text>
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
                <Button size="3" asChild data-stripe-plan="organic-monthly" className="mt-2">
                  <Link href="#checkout">Add Stripe checkout hook</Link>
                </Button>
              </Flex>
            </Card>

            <Card className="border border-slate-300/60 bg-slate-100/60 p-8 shadow-sm backdrop-blur dark:border-slate-600/60 dark:bg-slate-800/60">
              <Flex direction="column" gap="4">
                <Text size="2" color="gray" className="uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Paid media & custom renders
                </Text>
                <Heading size="5">Consultative engagement</Heading>
                <Text size="3" color="gray">
                  Unlock campaign engineering, creative ops, and premium render packages tailor-made for your growth stage.
                </Text>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-200">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    <span>Joint planning workshop with Alex's team</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    <span>Agentic budget pacing and creative experimentation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    <span>Reserved access to Continuum's render studio</span>
                  </li>
                </ul>
                <Button size="3" variant="outline" asChild>
                  <Link href="#book-demo">Book consultation</Link>
                </Button>
              </Flex>
            </Card>
          </Grid>

          <Text size="2" color="gray" className="text-slate-500 dark:text-slate-300">
            Need procurement paperwork or enterprise security review? Email us at <a href="mailto:hello@continuum.ai" className="underline">hello@continuum.ai</a>.
          </Text>
        </Flex>
      </Container>
    </Box>
  );
}

export default PricingSection;

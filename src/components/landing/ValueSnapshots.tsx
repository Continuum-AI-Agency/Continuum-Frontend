import { Box, Container, Flex, Grid, Heading, Text, Card } from "@radix-ui/themes";

const beforeBullets = [
  "Manual tab-hopping between social, paid, and analytics tools",
  "Creative briefs lost in chats and inconsistent brand voice",
  "Reporting stitched together weekly with spreadsheets",
];

const afterBullets = [
  "OAuth onboarding links every channel with role-based control in minutes",
  "AI-generated calendars keep every caption, prompt, and asset on-brand",
  "Unified analytics surface cross-platform ROI in real time",
];

export function ValueSnapshots() {
  return (
    <Box className="relative">
      <Container size="3" className="py-20">
        <Flex direction="column" gap="6">
          <Heading size="6">See the delta Continuum delivers</Heading>
          <Text size="3" color="gray" className="max-w-3xl">
            Teams who move to Continuum compress onboarding to five minutes, publish a week of content in under an hour, and review organic plus paid performance without stitching dashboards together.
          </Text>
          <Grid columns={{ initial: "1", md: "2" }} gap="6">
            <Card className="border border-rose-300/50 bg-rose-100/30 p-6 shadow-sm backdrop-blur dark:border-rose-500/40 dark:bg-rose-500/10">
              <Heading size="4" className="text-rose-600 dark:text-rose-300">Before Continuum</Heading>
              <Box className="mt-4 space-y-3">
                {beforeBullets.map((bullet) => (
                  <Text key={bullet} size="3" color="gray" className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                    <span className="mt-1 h-2 w-2 rounded-full bg-rose-500" />
                    <span>{bullet}</span>
                  </Text>
                ))}
              </Box>
            </Card>
            <Card className="border border-emerald-300/60 bg-emerald-100/40 p-6 shadow-lg backdrop-blur dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <Heading size="4" className="text-emerald-700 dark:text-emerald-300">With Continuum</Heading>
              <Box className="mt-4 space-y-3">
                {afterBullets.map((bullet) => (
                  <Text key={bullet} size="3" color="gray" className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{bullet}</span>
                  </Text>
                ))}
              </Box>
            </Card>
          </Grid>
        </Flex>
      </Container>
    </Box>
  );
}

export default ValueSnapshots;

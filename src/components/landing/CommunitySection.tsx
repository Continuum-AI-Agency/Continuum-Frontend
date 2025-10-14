import Link from "next/link";
import { Box, Container, Flex, Grid, Heading, Text, Card, Button, TextArea, TextField } from "@radix-ui/themes";

export function CommunitySection() {
  return (
    <Box id="book-demo" className="relative bg-white/60 dark:bg-slate-900/40">
      <Container size="3" className="py-20">
        <Grid columns={{ initial: "1", lg: "2" }} gap="8" align="center">
          <Card className="border border-white/40 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-slate-900/70">
            <Flex direction="column" gap="4">
              <Heading size="5">Book an interactive walkthrough</Heading>
              <Text size="3" color="gray">
                Pick a slot, share goals, and get instant access to our interactive dashboard demo. We sense-check each request with three quick questions so we can tailor the session.
              </Text>
              <Flex direction="column" gap="3">
                <TextField.Root placeholder="Work email" size="3" />
                <TextField.Root placeholder="Company" size="3" />
                <TextArea placeholder="What are you trying to launch next?" size="3" className="min-h-[96px]" />
              </Flex>
              <Button size="3" data-intent="schedule-demo">Request live session</Button>
              <Text size="2" color="gray" className="text-slate-500 dark:text-slate-300">
                We reply within one business day. Self-serve scheduling coming soon.
              </Text>
            </Flex>
          </Card>

          <Card className="border border-purple-300/50 bg-purple-100/40 p-8 shadow-sm backdrop-blur dark:border-purple-500/40 dark:bg-purple-500/15">
            <Flex direction="column" gap="4" align="start">
              <Heading size="5">Join our orbit</Heading>
              <Text size="3" color="gray" className="text-purple-900/80 dark:text-purple-100/80">
                Tap into behind-the-scenes drops, launch templates, and live AMA sessions with our founder.
              </Text>
              <Button size="3" variant="outline" asChild>
                <Link href="https://www.instagram.com/lachicadelaia" target="_blank" rel="noreferrer">
                  Follow @lachicadelaia
                </Link>
              </Button>
              <Text size="2" color="gray" className="text-purple-900/70 dark:text-purple-100/70">
                Prefer email? Subscribe inside the Instagram bio. We announce every product iteration there first.
              </Text>
            </Flex>
          </Card>
        </Grid>
      </Container>
    </Box>
  );
}

export default CommunitySection;

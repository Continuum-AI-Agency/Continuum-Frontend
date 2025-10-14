import Link from "next/link";
import { Box, Container, Flex, Grid, Heading, Text, Card, Badge } from "@radix-ui/themes";

const testimonials = [
  {
    name: "Placeholder CMO",
    role: "Scaling DTC brand",
    quote: "Continuum gave us one source of truth for organic and paid within a week. The alerts alone saved our launch budget.",
  },
  {
    name: "Placeholder Agency Partner",
    role: "Performance marketing lead",
    quote: "Our creative approvals dropped from days to hours because clients can react directly inside the Continuum workspace.",
  },
];

export function ProofSection() {
  return (
    <Box className="relative bg-white/60 dark:bg-slate-900/40">
      <Container size="3" className="py-20">
        <Flex direction="column" gap="8">
          <Box>
            <Badge size="2" color="gray" className="rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              Social + investor proof
            </Badge>
            <Heading size="6" className="mt-3">Trusted by ambitious marketing teams</Heading>
            <Text size="3" color="gray" className="mt-2 max-w-3xl">
              Swap these placeholders with customer logos, quotes, and your latest funding announcement to mirror YC-grade credibility.
            </Text>
          </Box>

          <Grid columns={{ initial: "2", sm: "4" }} gap="4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} className="flex h-20 items-center justify-center border border-dashed border-slate-300/80 bg-white/80 text-sm font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-300">
                Logo placeholder
              </Card>
            ))}
          </Grid>

          <Grid columns={{ initial: "1", md: "2" }} gap="6">
            {testimonials.map((item) => (
              <Card key={item.name} className="h-full border border-white/40 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900/70">
                <Text size="3" className="text-slate-700 dark:text-slate-100">&ldquo;{item.quote}&rdquo;</Text>
                <Text size="2" color="gray" className="mt-4 font-medium text-slate-500 dark:text-slate-300">
                  {item.name}
                </Text>
                <Text size="2" color="gray" className="text-slate-400 dark:text-slate-400">
                  {item.role}
                </Text>
              </Card>
            ))}
          </Grid>

          <Card className="border border-purple-300/60 bg-purple-100/40 p-6 text-sm shadow-md backdrop-blur dark:border-purple-500/40 dark:bg-purple-500/15">
            <Flex direction={{ initial: "column", md: "row" }} align={{ initial: "start", md: "center" }} justify="between" gap="4">
              <Box>
                <Text size="2" color="gray" className="uppercase tracking-wide text-purple-700 dark:text-purple-200">
                  Investor highlight placeholder
                </Text>
                <Heading size="4" className="mt-1 text-purple-800 dark:text-purple-200">
                  Announce your latest raise the moment it lands
                </Heading>
                <Text size="2" color="gray" className="mt-2 max-w-xl text-purple-900/80 dark:text-purple-100/80">
                  Drop in your press link and investor roster here. Pair it with a top-of-site banner for FOMO just like YC teams do.
                </Text>
              </Box>
              <Link href="#investor-news" className="text-sm font-semibold text-purple-700 underline dark:text-purple-200">
                Add announcement link -&gt;
              </Link>
            </Flex>
          </Card>
        </Flex>
      </Container>
    </Box>
  );
}

export default ProofSection;

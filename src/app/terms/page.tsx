import { Container, Heading, Text, Section, Separator } from "@radix-ui/themes";
import SiteHeader from "../../components/site/SiteHeader";
import SiteFooter from "../../components/site/SiteFooter";

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <main>
      <SiteHeader />
      <Section size="3">
        <Container size="3">
          <Heading size="8" className="tracking-tight">Terms of Service</Heading>
          <Text color="gray" size="3">Effective date: {new Date().getFullYear()} </Text>
          <Separator my="4" size="4" />

          <Heading size="4">Agreement</Heading>
          <Text as="p" my="3" color="gray">
            By using Continuum AI, you agree to these terms. If you do not agree, do not use the service.
          </Text>

          <Heading size="4" mt="5">Acceptable Use</Heading>
          <Text as="p" my="3" color="gray">
            You will comply with applicable laws, respect intellectual property rights, and avoid abusive or harmful behavior.
          </Text>

          <Heading size="4" mt="5">Limitation of Liability</Heading>
          <Text as="p" my="3" color="gray">
            To the maximum extent permitted by law, Continuum AI is not liable for indirect, incidental, or consequential damages.
          </Text>
        </Container>
      </Section>
      <SiteFooter />
    </main>
  );
}

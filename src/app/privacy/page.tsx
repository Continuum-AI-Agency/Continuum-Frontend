import { Container, Heading, Text, Section, Separator } from "@radix-ui/themes";
import SiteHeader from "../../components/site/SiteHeader";
import SiteFooter from "../../components/site/SiteFooter";

export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <main>
      <SiteHeader />
      <Section size="3">
        <Container size="3">
          <Heading size="8" className="tracking-tight">Privacy Policy</Heading>
          <Text color="gray" size="3">Effective date: {new Date().getFullYear()} </Text>
          <Separator my="4" size="4" />

          <Heading size="4">Overview</Heading>
          <Text as="p" my="3" color="gray">
            We respect your privacy. This policy describes the information we collect, how we use it, and your choices.
          </Text>

          <Heading size="4" mt="5">Information We Collect</Heading>
          <Text as="p" my="3" color="gray">
            We may collect account details, usage analytics, and content you provide. We do not sell personal data.
          </Text>

          <Heading size="4" mt="5">How We Use Information</Heading>
          <Text as="p" my="3" color="gray">
            To provide and improve the service, secure accounts, personalize experiences, and comply with legal obligations.
          </Text>

          <Heading size="4" mt="5">Your Choices</Heading>
          <Text as="p" my="3" color="gray">
            You can request access, correction, or deletion of your data. Contact us at privacy@continuum.example.
          </Text>
        </Container>
      </Section>
      <SiteFooter />
    </main>
  );
}

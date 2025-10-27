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
          <Text color="gray" size="3">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
          <Separator my="4" size="4" />

          <Text as="p" my="3" color="gray">
            Please read these Terms of Service (&quot;Terms&quot;, &quot;Terms of Service&quot;) carefully before using the Continuum AI website and service (the &quot;Service&quot;) operated by Continuum AI (&quot;us&quot;, &quot;we&quot;, or &quot;our&quot;). Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users and others who access or use the Service.
          </Text>

          <Heading size="4" mt="5">1. Accounts</Heading>
          <Text as="p" my="3" color="gray">
            When you create an account with us, you must provide us information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service. You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password.
          </Text>

          <Heading size="4" mt="5">2. Intellectual Property</Heading>
          <Text as="p" my="3" color="gray">
            The Service and its original content, features and functionality are and will remain the exclusive property of Continuum AI and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Continuum AI.
          </Text>

          <Heading size="4" mt="5">3. User Conduct and Acceptable Use</Heading>
          <Text as="p" my="3" color="gray">
            You agree not to use the Service to:
          </Text>
          <ul>
            <li><Text color="gray">Violate any local, state, national, or international law or regulation.</Text></li>
            <li><Text color="gray">Transmit any material that is abusive, harassing, tortious, defamatory, vulgar, pornographic, obscene, libelous, invasive of another&apos;s privacy, hateful, or racially, ethnically, or otherwise objectionable.</Text></li>
            <li><Text color="gray">Transmit any unsolicited or unauthorized advertising, promotional materials, &quot;junk mail,&quot; &quot;spam,&quot; &quot;chain letters,&quot; &quot;pyramid schemes,&quot; or any other form of solicitation.</Text></li>
            <li><Text color="gray">Knowingly transmit any material that contains adware, malware, spyware, software viruses, or any other computer code, files, or programs designed to interrupt, destroy, or limit the functionality of any computer software or hardware or telecommunications equipment.</Text></li>
          </ul>

          <Heading size="4" mt="5">4. Third-Party Integrations</Heading>
          <Text as="p" my="3" color="gray">
            Our Service may contain links to third-party web sites or services that are not owned or controlled by Continuum AI. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party web sites or services. You further acknowledge and agree that Continuum AI shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with use of or reliance on any such content, goods or services available on or through any such web sites or services.
          </Text>

          <Heading size="4" mt="5">5. Termination</Heading>
          <Text as="p" my="3" color="gray">
            We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
          </Text>

          <Heading size="4" mt="5">6. Limitation of Liability</Heading>
          <Text as="p" my="3" color="gray">
            In no event shall Continuum AI, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
          </Text>

          <Heading size="4" mt="5">7. Disclaimer</Heading>
          <Text as="p" my="3" color="gray">
            Your use of the Service is at your sole risk. The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement or course of performance.
          </Text>

          <Heading size="4" mt="5">8. Governing Law</Heading>
          <Text as="p" my="3" color="gray">
            These Terms shall be governed and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.
          </Text>

          <Heading size="4" mt="5">9. Changes</Heading>
          <Text as="p" my="3" color="gray">
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days&apos; notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
          </Text>

          <Heading size="4" mt="5">10. Contact Us</Heading>
          <Text as="p" my="3" color="gray">
            If you have any questions about these Terms, please contact us at: legal@continuum.ai
          </Text>
        </Container>
      </Section>
      <SiteFooter />
    </main>
  );
}
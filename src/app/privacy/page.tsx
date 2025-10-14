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
          <Text color="gray" size="3">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
          <Separator my="4" size="4" />

          <Text as="p" my="3" color="gray">
            Continuum AI ("us", "we", or "our") operates the Continuum AI website and service (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data. We use your data to provide and improve the Service. By using the Service, you agree to the collection and use of information in accordance with this policy.
          </Text>

          <Heading size="4" mt="5">1. Information Collection and Use</Heading>
          <Text as="p" my="3" color="gray">
            We collect several different types of information for various purposes to provide and improve our Service to you.
          </Text>

          <Heading size="3" mt="4">Types of Data Collected</Heading>
          <Text as="p" my="2" color="gray">
            <strong>Personal Data:</strong> While using our Service, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you ("Personal Data"). This may include, but is not limited to: email address, first name and last name, company name, and usage data.
          </Text>
          <Text as="p" my="2" color="gray">
            <strong>Usage Data:</strong> We may also collect information on how the Service is accessed and used ("Usage Data"). This Usage Data may include information such as your computer's Internet Protocol address (e.g. IP address), browser type, browser version, the pages of our Service that you visit, the time and date of your visit, the time spent on those pages, unique device identifiers and other diagnostic data.
          </Text>
          <Text as="p" my="2" color="gray">
            <strong>Tracking & Cookies Data:</strong> We use cookies and similar tracking technologies to track the activity on our Service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.
          </Text>

          <Heading size="4" mt="5">2. Use of Data</Heading>
          <Text as="p" my="3" color="gray">
            Continuum AI uses the collected data for various purposes:
          </Text>
          <ul>
            <li><Text color="gray">To provide and maintain the Service</Text></li>
            <li><Text color="gray">To notify you about changes to our Service</Text></li>
            <li><Text color="gray">To allow you to participate in interactive features of our Service when you choose to do so</Text></li>
            <li><Text color="gray">To provide customer care and support</Text></li>
            <li><Text color="gray">To provide analysis or valuable information so that we can improve the Service</Text></li>
            <li><Text color="gray">To monitor the usage of the Service</Text></li>
            <li><Text color="gray">To detect, prevent and address technical issues</Text></li>
          </ul>

          <Heading size="4" mt="5">3. Data Transfer and Storage</Heading>
          <Text as="p" my="3" color="gray">
            Your information, including Personal Data, may be transferred to — and maintained on — computers located outside of your state, province, country or other governmental jurisdiction where the data protection laws may differ from those from your jurisdiction. Your consent to this Privacy Policy followed by your submission of such information represents your agreement to that transfer. We will take all steps reasonably necessary to ensure that your data is treated securely and in accordance with this Privacy Policy.
          </Text>

          <Heading size="4" mt="5">4. Disclosure of Data</Heading>
          <Text as="p" my="3" color="gray">
            We may disclose your Personal Data in the good faith belief that such action is necessary to:
          </Text>
          <ul>
            <li><Text color="gray">To comply with a legal obligation</Text></li>
            <li><Text color="gray">To protect and defend the rights or property of Continuum AI</Text></li>
            <li><Text color="gray">To prevent or investigate possible wrongdoing in connection with the Service</Text></li>
            <li><Text color="gray">To protect the personal safety of users of the Service or the public</Text></li>
            <li><Text color="gray">To protect against legal liability</Text></li>
          </ul>

          <Heading size="4" mt="5">5. Data Security</Heading>
          <Text as="p" my="3" color="gray">
            The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
          </Text>

          <Heading size="4" mt="5">6. Service Providers</Heading>
          <Text as="p" my="3" color="gray">
            We may employ third-party companies and individuals to facilitate our Service ("Service Providers"), to provide the Service on our behalf, to perform Service-related services or to assist us in analyzing how our Service is used. These third parties have access to your Personal Data only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.
          </Text>

          <Heading size="4" mt="5">7. Your Data Protection Rights</Heading>
          <Text as="p" my="3" color="gray">
            Depending on your location, you may have the following rights regarding your personal data: the right to access, update or delete the information we have on you; the right of rectification; the right to object; the right of restriction; the right to data portability; and the right to withdraw consent. You can exercise these rights by contacting us.
          </Text>

          <Heading size="4" mt="5">8. Children's Privacy</Heading>
          <Text as="p" my="3" color="gray">
            Our Service does not address anyone under the age of 18 ("Children"). We do not knowingly collect personally identifiable information from anyone under the age of 18. If you are a parent or guardian and you are aware that your Children has provided us with Personal Data, please contact us.
          </Text>

          <Heading size="4" mt="5">9. Changes to This Privacy Policy</Heading>
          <Text as="p" my="3" color="gray">
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
          </Text>

          <Heading size="4" mt="5">10. Contact Us</Heading>
          <Text as="p" my="3" color="gray">
            If you have any questions about this Privacy Policy, please contact us at: privacy@continuum.ai
          </Text>
        </Container>
      </Section>
      <SiteFooter />
    </main>
  );
}
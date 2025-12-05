import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { LOGIN_GLOW_GRADIENT } from "@/lib/ui/backgrounds";

export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-default text-primary" style={{ backgroundImage: LOGIN_GLOW_GRADIENT }}>
      {/* Header */}
      <div className="p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back to home</span>
        </Link>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {/* Logo */}
        <div className="mb-8">
          <Image
            src="/logos/Continuum.png"
            alt="Continuum"
            width={180}
            height={48}
            priority
            className="h-12 w-auto"
          />
        </div>

        {/* Card */}
        <div className="glass-panel rounded-3xl p-12 shadow-2xl border-subtle">
          <h1 className="text-4xl font-bold text-primary mb-2 tracking-tight">Privacy Policy</h1>
          <p className="text-secondary text-sm mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-8" />

          <div className="prose dark:prose-invert max-w-none text-secondary prose-headings:text-primary">
            <p className="text-secondary leading-relaxed mb-6">
              Continuum AI ("us", "we", or "our") operates the Continuum AI website and service (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data. We use your data to provide and improve the Service. By using the Service, you agree to the collection and use of information in accordance with this policy.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">1. Information Collection and Use</h2>
            <p className="text-secondary leading-relaxed mb-6">
              We collect several different types of information for various purposes to provide and improve our Service to you.
            </p>

            <h3 className="text-xl font-semibold text-primary mt-6 mb-3">Types of Data Collected</h3>
            <p className="text-secondary leading-relaxed mb-4">
              <strong className="text-primary">Personal Data:</strong> While using our Service, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you ("Personal Data"). This may include, but is not limited to: email address, first name and last name, company name, and usage data.
            </p>
            <p className="text-secondary leading-relaxed mb-4">
              <strong className="text-primary">Usage Data:</strong> We may also collect information on how the Service is accessed and used ("Usage Data"). This Usage Data may include information such as your computer's Internet Protocol address (e.g. IP address), browser type, browser version, the pages of our Service that you visit, the time and date of your visit, the time spent on those pages, unique device identifiers and other diagnostic data.
            </p>
            <p className="text-secondary leading-relaxed mb-6">
              <strong className="text-primary">Tracking & Cookies Data:</strong> We use cookies and similar tracking technologies to track the activity on our Service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">2. Use of Data</h2>
            <p className="text-secondary leading-relaxed mb-4">
              Continuum AI uses the collected data for various purposes:
            </p>
            <ul className="list-disc list-inside space-y-2 text-secondary mb-6 ml-4">
              <li>To provide and maintain the Service</li>
              <li>To notify you about changes to our Service</li>
              <li>To allow you to participate in interactive features of our Service when you choose to do so</li>
              <li>To provide customer care and support</li>
              <li>To provide analysis or valuable information so that we can improve the Service</li>
              <li>To monitor the usage of the Service</li>
              <li>To detect, prevent and address technical issues</li>
            </ul>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">3. Data Transfer and Storage</h2>
            <p className="text-secondary leading-relaxed mb-6">
              Your information, including Personal Data, may be transferred to — and maintained on — computers located outside of your state, province, country or other governmental jurisdiction where the data protection laws may differ from those from your jurisdiction. Your consent to this Privacy Policy followed by your submission of such information represents your agreement to that transfer. We will take all steps reasonably necessary to ensure that your data is treated securely and in accordance with this Privacy Policy.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">4. Disclosure of Data</h2>
            <p className="text-secondary leading-relaxed mb-4">
              We may disclose your Personal Data in the good faith belief that such action is necessary to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-secondary mb-6 ml-4">
              <li>To comply with a legal obligation</li>
              <li>To protect and defend the rights or property of Continuum AI</li>
              <li>To prevent or investigate possible wrongdoing in connection with the Service</li>
              <li>To protect the personal safety of users of the Service or the public</li>
              <li>To protect against legal liability</li>
            </ul>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">5. Data Security</h2>
            <p className="text-secondary leading-relaxed mb-6">
              The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">6. Service Providers</h2>
            <p className="text-secondary leading-relaxed mb-6">
              We may employ third-party companies and individuals to facilitate our Service ("Service Providers"), to provide the Service on our behalf, to perform Service-related services or to assist us in analyzing how our Service is used. These third parties have access to your Personal Data only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">7. Your Data Protection Rights</h2>
            <p className="text-secondary leading-relaxed mb-6">
              Depending on your location, you may have the following rights regarding your personal data: the right to access, update or delete the information we have on you; the right of rectification; the right to object; the right of restriction; the right to data portability; and the right to withdraw consent. You can exercise these rights by contacting us.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">8. Children's Privacy</h2>
            <p className="text-secondary leading-relaxed mb-6">
              Our Service does not address anyone under the age of 18 ("Children"). We do not knowingly collect personally identifiable information from anyone under the age of 18. If you are a parent or guardian and you are aware that your Children has provided us with Personal Data, please contact us.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">9. Changes to This Privacy Policy</h2>
            <p className="text-secondary leading-relaxed mb-6">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">10. Contact Us</h2>
            <p className="text-secondary leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at: <a
                href="mailto:privacy@continuum.ai"
                className="underline transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                privacy@continuum.ai
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

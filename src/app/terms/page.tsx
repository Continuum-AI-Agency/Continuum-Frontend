import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { LOGIN_GLOW_GRADIENT } from "@/lib/ui/backgrounds";

export const dynamic = "force-static";

export default function TermsPage() {
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
          <h1 className="text-4xl font-bold text-primary mb-2 tracking-tight">Terms of Service</h1>
          <p className="text-secondary text-sm mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-8" />

          <div className="prose dark:prose-invert max-w-none text-secondary prose-headings:text-primary">
            <p className="leading-relaxed mb-6">
              Please read these Terms of Service (&quot;Terms&quot;, &quot;Terms of Service&quot;) carefully before using the Continuum AI website and service (the &quot;Service&quot;) operated by Continuum AI (&quot;us&quot;, &quot;we&quot;, or &quot;our&quot;). Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users and others who access or use the Service.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">1. Accounts</h2>
            <p className="leading-relaxed mb-6">
              When you create an account with us, you must provide us information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service. You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">2. Intellectual Property</h2>
            <p className="leading-relaxed mb-6">
              The Service and its original content, features and functionality are and will remain the exclusive property of Continuum AI and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Continuum AI.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">3. User Conduct and Acceptable Use</h2>
            <p className="leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>Violate any local, state, national, or international law or regulation.</li>
              <li>Transmit any material that is abusive, harassing, tortious, defamatory, vulgar, pornographic, obscene, libelous, invasive of another&apos;s privacy, hateful, or racially, ethnically, or otherwise objectionable.</li>
              <li>Transmit any unsolicited or unauthorized advertising, promotional materials, &quot;junk mail,&quot; &quot;spam,&quot; &quot;chain letters,&quot; &quot;pyramid schemes,&quot; or any other form of solicitation.</li>
              <li>Knowingly transmit any material that contains adware, malware, spyware, software viruses, or any other computer code, files, or programs designed to interrupt, destroy, or limit the functionality of any computer software or hardware or telecommunications equipment.</li>
            </ul>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">4. Third-Party Integrations</h2>
            <p className="leading-relaxed mb-6">
              Our Service may contain links to third-party web sites or services that are not owned or controlled by Continuum AI. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party web sites or services. You further acknowledge and agree that Continuum AI shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with use of or reliance on any such content, goods or services available on or through any such web sites or services.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">5. Termination</h2>
            <p className="leading-relaxed mb-6">
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">6. Limitation of Liability</h2>
            <p className="leading-relaxed mb-6">
              In no event shall Continuum AI, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">7. Disclaimer</h2>
            <p className="leading-relaxed mb-6">
              Your use of the Service is at your sole risk. The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement or course of performance.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">8. Governing Law</h2>
            <p className="leading-relaxed mb-6">
              These Terms shall be governed and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">9. Changes</h2>
            <p className="leading-relaxed mb-6">
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days&apos; notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
            </p>

            <h2 className="text-2xl font-bold text-primary mt-8 mb-4">10. Contact Us</h2>
            <p className="leading-relaxed">
              If you have any questions about these Terms, please contact us at: <a
                href="mailto:legal@continuum.ai"
                className="underline transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                legal@continuum.ai
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

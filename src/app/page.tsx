import SiteHeader from "../components/site/SiteHeader";
import SiteFooter from "../components/site/SiteFooter";
import { HeroSection } from "../components/landing/HeroSection";
import { ProductHighlights } from "../components/landing/ProductHighlights";
import { ValueSnapshots } from "../components/landing/ValueSnapshots";
import { ProofSection } from "../components/landing/ProofSection";
import { PricingSection } from "../components/landing/PricingSection";
import { FAQSection } from "../components/landing/FAQSection";
import { CommunitySection } from "../components/landing/CommunitySection";

export const dynamic = "force-static";

export default function Home() {
  return (
    <main className="relative z-10">
      <SiteHeader />
      <HeroSection />
      <ProductHighlights />
      <ValueSnapshots />
      <ProofSection />
      <PricingSection />
      <FAQSection />
      <CommunitySection />
      <SiteFooter />
    </main>
  );
}

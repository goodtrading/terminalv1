import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { AccessCTA } from "@/components/marketing/AccessCTA";
import { ThematicTopicsSection } from "@/components/marketing/ThematicTopicsSection";

import { StickyProductStory } from "@/components/marketing/StickyProductStory";
import { ProductMetrics } from "@/components/marketing/ProductMetrics";
import { ProductScreenshotsSection } from "@/components/marketing/ProductScreenshotsSection";
import { TechnicalMarquee } from "@/components/marketing/TechnicalMarquee";
import { ProductCards } from "@/components/marketing/ProductCards";
import { FinalCtaSection } from "@/components/marketing/FinalCtaSection";

export default function HomePage() {
  return (
    <MarketingLayout>
      <AccessCTA className="pb-6 pt-10 sm:pt-14 lg:pt-16" />
      <ThematicTopicsSection />
      <StickyProductStory />
      <ProductMetrics />
      <ProductScreenshotsSection />
      <TechnicalMarquee />
      <ProductCards />
      <FinalCtaSection />
    </MarketingLayout>
  );
}

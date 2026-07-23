import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { AccessCTA } from "@/components/marketing/AccessCTA";
import { ThematicTopicsSection } from "@/components/marketing/ThematicTopicsSection";
import { AudienceSection } from "@/components/marketing/AudienceSection";
import { ProductScreenshotsSection } from "@/components/marketing/ProductScreenshotsSection";
import { ProductCards } from "@/components/marketing/ProductCards";
import { DesktopSection } from "@/components/marketing/DesktopSection";
import { FinalCtaSection } from "@/components/marketing/FinalCtaSection";

export default function HomePage() {
  return (
    <MarketingLayout>
      <AccessCTA className="pb-6 pt-10 sm:pt-14 lg:pt-16" />
      <ThematicTopicsSection />
      <AudienceSection />
      <ProductScreenshotsSection />
      <ProductCards />
      <DesktopSection />
      <FinalCtaSection />
    </MarketingLayout>
  );
}

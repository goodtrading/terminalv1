import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { AccessCTA } from "@/components/marketing/AccessCTA";
import { AudienceSection } from "@/components/marketing/AudienceSection";
import { TerminalPreview } from "@/components/marketing/TerminalPreview";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { ProductCards } from "@/components/marketing/ProductCards";
import { RoadmapSection } from "@/components/marketing/RoadmapSection";
import { FinalCtaSection } from "@/components/marketing/FinalCtaSection";

export default function HomePage() {
  return (
    <MarketingLayout>
      <AccessCTA className="pb-6 pt-10 sm:pt-14 lg:pt-16" />
      <AudienceSection />
      <TerminalPreview />
      <ComparisonTable />
      <ProductCards />
      <RoadmapSection />
      <FinalCtaSection />
    </MarketingLayout>
  );
}

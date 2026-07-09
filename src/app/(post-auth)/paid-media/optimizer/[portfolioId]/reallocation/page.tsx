import { PortfolioHeader } from "@/components/paid-media/optimizer/screens/PortfolioHeader";
import { ReallocationClient } from "@/components/paid-media/optimizer/screens/ReallocationClient";

export default async function PortfolioReallocationPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  return (
    <div className="flex flex-col gap-4">
      <PortfolioHeader portfolioId={portfolioId} />
      <ReallocationClient portfolioId={portfolioId} />
    </div>
  );
}

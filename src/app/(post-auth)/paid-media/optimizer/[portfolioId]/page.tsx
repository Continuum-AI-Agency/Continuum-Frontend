import { PortfolioHeader } from "@/components/paid-media/optimizer/screens/PortfolioHeader";
import { DashboardClient } from "@/components/paid-media/optimizer/screens/DashboardClient";

export default async function PortfolioDashboardPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  return (
    <div className="flex flex-col gap-4">
      <PortfolioHeader portfolioId={portfolioId} />
      <DashboardClient portfolioId={portfolioId} />
    </div>
  );
}

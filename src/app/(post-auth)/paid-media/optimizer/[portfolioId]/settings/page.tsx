import { PortfolioHeader } from "@/components/paid-media/optimizer/screens/PortfolioHeader";
import { SettingsClient } from "@/components/paid-media/optimizer/screens/SettingsClient";

export default async function PortfolioSettingsPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  return (
    <div className="flex flex-col gap-4">
      <PortfolioHeader portfolioId={portfolioId} />
      <SettingsClient portfolioId={portfolioId} />
    </div>
  );
}

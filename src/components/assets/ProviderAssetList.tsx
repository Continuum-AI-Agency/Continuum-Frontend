import type { Asset } from "@/lib/schemas/brand-assets";
import { AssetRow } from "@/components/assets/AssetRow";

export function ProviderAssetList({
	provider,
	assets,
	selected,
	onToggle,
	disabled,
}: {
	provider: string;
	assets: Asset[];
	selected: Record<string, boolean>;
	onToggle: (key: string, checked: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<section className="space-y-3">
			<h2 className="text-lg font-medium capitalize">{provider}</h2>
			<ul className="divide-y divide-gray-200 rounded border">
				{assets.map((a) => {
					const key = `${a.provider}:${a.assetId}`;
					return (
						<AssetRow
							key={key}
							asset={a}
							checked={Boolean(selected[key])}
							onCheckedChange={(checked) => onToggle(key, checked)}
							disabled={disabled}
						/>
					);
				})}
			</ul>
		</section>
	);
}



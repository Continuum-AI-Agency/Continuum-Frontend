import type { Asset } from "@/lib/schemas/brand-assets";
import { ProviderIcon } from "@/components/providers/providerIcons";

export function AssetRow({
	asset,
	checked,
	onCheckedChange,
	disabled,
}: {
	asset: Asset;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<li className="flex items-center justify-between gap-4 p-3">
			<div className="flex items-center gap-3">
				{asset.avatarUrl ? (
					<img src={asset.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
				) : (
					<div className="h-8 w-8 rounded-full bg-gray-200" />
				)}
				<div>
					<div className="text-sm font-medium flex items-center gap-2">
						<ProviderIcon provider={asset.provider} className="inline-block text-xs" />
						{asset.displayName}
					</div>
					{asset.handle ? <div className="text-xs text-gray-500">{asset.handle}</div> : null}
				</div>
			</div>
			<div className="flex items-center gap-3">
				{!asset.connected ? (
					<span className="text-xs text-amber-600">Needs auth</span>
				) : null}
				<input
					type="checkbox"
					checked={checked}
					onChange={(e) => onCheckedChange(e.target.checked)}
					disabled={!asset.connected || disabled}
				/>
			</div>
		</li>
	);
}



"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyBrandProfileIntegrationAccounts } from "@/lib/api/integrations";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import { runStrategicAnalysis } from "@/lib/api/strategicAnalyses.client";
import { useToast } from "@/components/ui/ToastProvider";
import { PLATFORMS, type PlatformKey } from "@/components/onboarding/platforms";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";

type Props = {
	brandProfileId: string;
	selectableAssetsResponse: SelectableAssetsResponse;
	assignedIntegrationAccountIds: string[];
};

const formSchema = z.object({
	selected: z.record(z.boolean()),
});
type FormValues = z.infer<typeof formSchema>;

function resolveSelectableAssetLabel(asset: Pick<SelectableAsset, "name" | "external_id">): string {
	return asset.name?.trim() || asset.external_id;
}

function groupSelectableAssetsByPlatform(
	assets: SelectableAsset[]
): Record<PlatformKey, SelectableAsset[]> {
	const grouped = PLATFORMS.reduce((acc, { key }) => {
		acc[key] = [];
		return acc;
	}, {} as Record<PlatformKey, SelectableAsset[]>);

	assets.forEach(asset => {
		const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
		if (!platformKey) return;
		grouped[platformKey].push(asset);
	});

	return grouped;
}

export function BrandAssetsForm({
	brandProfileId,
	selectableAssetsResponse,
	assignedIntegrationAccountIds,
}: Props) {
	const selectableAssets = selectableAssetsResponse.assets ?? [];
	const assignedSet = useMemo(() => new Set(assignedIntegrationAccountIds), [assignedIntegrationAccountIds]);

	const defaultSelected: Record<string, boolean> = useMemo(() => {
		const selectedMap: Record<string, boolean> = {};
		selectableAssets.forEach(asset => {
			if (!asset.integration_account_id) return;
			selectedMap[asset.integration_account_id] = assignedSet.has(asset.integration_account_id);
		});
		return selectedMap;
	}, [assignedSet, selectableAssets]);

	const [serverError, setServerError] = useState<string | undefined>();
	const [isPending, startTransition] = useTransition();
	const [isRunningAnalysis, startAnalysisTransition] = useTransition();

	const { show } = useToast();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { selected: defaultSelected },
	});

	const selected = form.watch("selected");
	function handleToggle(key: string, checked: boolean) {
		form.setValue("selected", { ...selected, [key]: checked }, { shouldDirty: true, shouldTouch: true });
	}

	const grouped = useMemo(
		() => groupSelectableAssetsByPlatform(selectableAssets),
		[selectableAssets]
	);

	const orderedPlatforms = useMemo(
		() => PLATFORMS.filter(({ key }) => grouped[key]?.length),
		[grouped]
	);

	const unassignableCount = useMemo(
		() => selectableAssets.filter(asset => !asset.integration_account_id).length,
		[selectableAssets]
	);

	async function onSubmit(values: FormValues) {
		setServerError(undefined);
		const selectedIntegrationAccountIds = Object.entries(values.selected)
			.filter(([, isSelected]) => Boolean(isSelected))
			.map(([integrationAccountId]) => integrationAccountId);
		const previous = form.getValues();
		startTransition(async () => {
			try {
				const result = await applyBrandProfileIntegrationAccounts({
					brandId: brandProfileId,
					integrationAccountIds: selectedIntegrationAccountIds,
				});
				show({ title: "Assignments saved", description: `Linked ${result.linked} account(s).`, variant: "success" });
			} catch (e: unknown) {
				setServerError((e as Error).message ?? "Failed to save changes");
				form.reset(previous);
				show({ title: "Failed to save", description: (e as Error).message, variant: "error" });
			}
		});
	}

	const handleStrategicAnalysisRun = () => {
		startAnalysisTransition(async () => {
			try {
				const result = await runStrategicAnalysis(brandProfileId);
				const details = result.runId ?? result.taskId ?? result.status ?? undefined;
				show({
					title: "Strategic analysis queued",
					description: details ? `Run reference: ${details}` : "Regeneration requested for this brand.",
					variant: "success",
				});
			} catch (e: unknown) {
				const message = e instanceof Error ? e.message : "Unable to start strategic analysis run.";
				show({ title: "Run failed", description: message, variant: "error" });
			}
		});
	};

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Brand Assets</h1>
				<button
					type="submit"
					className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
					disabled={isPending}
				>
					Save
				</button>
			</div>
			<div className="text-sm text-slate-500">
				{selectableAssetsResponse.stale ? (
					<p className="text-amber-700">
						Your integrations are marked stale. Sync your providers if accounts look out of date.
					</p>
				) : null}
				{unassignableCount > 0 ? (
					<p className="text-amber-700">
						{unassignableCount} connected account(s) are not ready for assignment yet.
					</p>
				) : null}
				{selectableAssetsResponse.synced_at ? (
					<p>Last synced {new Date(selectableAssetsResponse.synced_at).toLocaleString()}</p>
				) : null}
			</div>
			{serverError ? (
				<div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
					{serverError}
				</div>
			) : null}
			<div className="flex flex-col gap-8">
				{orderedPlatforms.length === 0 ? (
					<p className="text-sm text-slate-500">
						No connected accounts available yet. Connect providers from your personal integrations first.
					</p>
				) : (
					orderedPlatforms.map(({ key, label }) => {
						const assets = grouped[key] ?? [];
						return (
							<section key={key} className="space-y-3">
								<h2 className="text-lg font-medium">{label}</h2>
								<ul className="divide-y divide-gray-200 rounded border">
									{assets.map(asset => {
										const integrationAccountId = asset.integration_account_id;
										const checked = integrationAccountId ? Boolean(selected[integrationAccountId]) : false;
										const disabled = isPending || !integrationAccountId;
										return (
											<li key={asset.asset_pk} className="flex items-center justify-between gap-4 p-3">
												<div>
													<div className="text-sm font-medium">{resolveSelectableAssetLabel(asset)}</div>
													<div className="text-xs text-gray-500">{asset.type}</div>
													{asset.business_id ? (
														<div className="text-xs text-gray-500">Business {asset.business_id}</div>
													) : null}
												</div>
												<div className="flex items-center gap-3">
													{!integrationAccountId ? (
														<span className="text-xs text-amber-600">Not ready</span>
													) : null}
													<input
														type="checkbox"
														checked={checked}
														onChange={(e) =>
															integrationAccountId ? handleToggle(integrationAccountId, e.target.checked) : undefined
														}
														disabled={disabled}
													/>
												</div>
											</li>
										);
									})}
								</ul>
							</section>
						);
					})
				)}
			</div>

			<div className="rounded-lg border border-slate-200/40 bg-slate-950/40 p-4 text-white">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">Strategic analyses</h2>
						<p className="text-sm text-slate-300">
							Trigger a manual regeneration when no strategic analysis data exists for this brand.
						</p>
					</div>
					<button
						type="button"
						onClick={handleStrategicAnalysisRun}
						className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
						disabled={isRunningAnalysis}
					>
						{isRunningAnalysis ? "Queuing..." : "Run analysis"}
					</button>
				</div>
			</div>
		</form>
	);
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Asset } from "@/lib/schemas/brand-assets";
import { updateBrandProfileAssets } from "@/lib/api/brandProfiles.client";
import { runStrategicAnalysis } from "@/lib/api/strategicAnalyses.client";
import { ProviderAssetList } from "@/components/assets/ProviderAssetList";
import { useToast } from "@/components/ui/ToastProvider";

type Props = {
	brandProfileId: string;
	availableAssets: Asset[];
	includedAssets: Asset[];
};

const formSchema = z.object({
	selected: z.record(z.boolean()).default({}),
});
type FormValues = z.infer<typeof formSchema>;

function makeKey(a: Pick<Asset, "provider" | "assetId">): string {
	return `${a.provider}:${a.assetId}`;
}

export function BrandAssetsForm({ brandProfileId, availableAssets, includedAssets }: Props) {
	const includedSet = useMemo(() => {
		const s = new Set<string>();
		for (const a of includedAssets) s.add(makeKey(a));
		return s;
	}, [includedAssets]);

	const defaultSelected: Record<string, boolean> = useMemo(() => {
		const map: Record<string, boolean> = {};
		for (const a of availableAssets) {
			map[makeKey(a)] = includedSet.has(makeKey(a));
		}
		return map;
	}, [availableAssets, includedSet]);

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

	const grouped = useMemo(() => {
		const byProvider: Record<string, Asset[]> = {};
		for (const a of availableAssets) {
			(byProvider[a.provider] ||= []).push(a);
		}
		return byProvider;
	}, [availableAssets]);

	async function onSubmit(values: FormValues) {
		setServerError(undefined);
		const chosen = Object.entries(values.selected)
			.filter(([, v]) => Boolean(v))
			.map(([k]) => k);
		const payload = {
			assets: chosen.map((key) => {
				const [provider, assetId] = key.split(":");
				return { provider, assetId };
			}),
		};
		const previous = form.getValues();
		startTransition(async () => {
			try {
				await updateBrandProfileAssets(brandProfileId, payload);
				show({ title: "Assets saved", variant: "success" });
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
			{serverError ? (
				<div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
					{serverError}
				</div>
			) : null}
			<div className="flex flex-col gap-8">
				{Object.entries(grouped).map(([provider, assets]) => (
					<ProviderAssetList
						key={provider}
						provider={provider}
						assets={assets}
						selected={selected}
						onToggle={handleToggle}
						disabled={isPending}
					/>
				))}
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

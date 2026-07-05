import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModelInfo, ModelRef } from "@omp-deck/protocol";

import { api } from "./api";

export interface ModelCatalogEntry {
	ref: ModelRef;
	info: ModelInfo;
	label: string;
	group: "subscription" | "api-key" | "local";
}

export interface ModelCatalogGroup {
	provider: string;
	providerLabel: string;
	items: ModelCatalogEntry[];
	hasCurrent: boolean;
}

export function modelKey(model: ModelRef): string {
	return `${model.provider}/${model.id}`;
}

export function modelLabel(model: ModelRef | undefined): string {
	if (!model) return "SDK default";
	return `${model.providerName ?? model.provider}/${model.id}`;
}

export function toModelRef(model: ModelInfo): ModelRef {
	return { provider: model.provider, id: model.id, providerName: model.providerName };
}

export function modelMatches(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
	return Boolean(a && b && a.provider === b.provider && a.id === b.id);
}

export function catalogEntry(model: ModelInfo): ModelCatalogEntry {
	return {
		ref: toModelRef(model),
		info: model,
		label: model.label,
		group: model.isSubscription ? "subscription" : model.provider === "local" ? "local" : "api-key",
	};
}

export function groupModelCatalog(models: ModelCatalogEntry[]): ModelCatalogGroup[] {
	const byProvider = new Map<string, ModelCatalogEntry[]>();
	for (const model of models) {
		const list = byProvider.get(model.ref.provider) ?? [];
		list.push(model);
		byProvider.set(model.ref.provider, list);
	}
	return Array.from(byProvider.entries())
		.map(([provider, items]) => ({
			provider,
			providerLabel: items[0]?.ref.providerName ?? provider,
			items: items.sort((a, b) => {
				if (a.info.isCurrent && !b.info.isCurrent) return -1;
				if (!a.info.isCurrent && b.info.isCurrent) return 1;
				return a.label.localeCompare(b.label);
			}),
			hasCurrent: items.some((m) => m.info.isCurrent),
		}))
		.sort((a, b) => {
			if (a.hasCurrent && !b.hasCurrent) return -1;
			if (!a.hasCurrent && b.hasCurrent) return 1;
			return a.providerLabel.localeCompare(b.providerLabel);
		});
}

export function useModelCatalog(sessionId?: string): {
	models: ModelCatalogEntry[];
	grouped: ModelCatalogGroup[];
	loading: boolean;
	error?: string;
	refresh: () => Promise<void>;
} {
	const [rawModels, setRawModels] = useState<ModelInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const refresh = useCallback(async (): Promise<void> => {
		setLoading(true);
		setError(undefined);
		try {
			const resp = await api.listModels(sessionId);
			setRawModels(resp.models);
		} catch (err) {
			setError(String((err as Error).message ?? err));
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const models = useMemo(() => rawModels.map(catalogEntry), [rawModels]);
	const grouped = useMemo(() => groupModelCatalog(models), [models]);

	return { models, grouped, loading, error, refresh };
}

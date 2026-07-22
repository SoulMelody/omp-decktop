import type { ModelProviderRecord, ProviderHealth } from "@omp-deck/protocol";

export type WorkspaceFilter = "all" | "ready" | "needs-attention" | "legacy";

export function applyFilters(
	providers: ModelProviderRecord[] | undefined,
	filter: WorkspaceFilter,
	search: string,
): ModelProviderRecord[] {
	if (!providers) return [];
	const needle = search.trim().toLowerCase();
	return providers.filter((provider) => {
		if (filter === "ready" && provider.health !== "ready") return false;
		if (filter === "needs-attention" && provider.health === "ready") return false;
		if (filter === "legacy" && !provider.legacy) return false;
		if (!needle) return true;
		return (
			provider.label.toLowerCase().includes(needle) || provider.id.toLowerCase().includes(needle)
		);
	});
}

export function healthLabel(health: ProviderHealth): string {
	switch (health) {
		case "ready":
			return "ready";
		case "needs-auth":
			return "needs auth";
		case "config-error":
			return "config error";
		case "discovery-warning":
			return "discovery warn";
		default:
			return "legacy";
	}
}

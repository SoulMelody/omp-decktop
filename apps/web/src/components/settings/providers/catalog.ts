import type {
	ModelProviderApi,
	RedactedModelDefinition,
	RedactedModelOverride,
} from "@omp-deck/protocol";

export type CatalogMode = "dynamic" | "pinned" | "hybrid" | "builtin";

export type ModelAction =
	| { kind: "add"; model: RedactedModelDefinition }
	| { kind: "edit"; id: string; patch: Partial<RedactedModelDefinition>; before?: RedactedModelDefinition }
	| { kind: "duplicate"; id: string; newId?: string; before?: RedactedModelDefinition }
	| { kind: "remove"; id: string; before?: RedactedModelDefinition }
	| { kind: "configure"; id: string; override?: RedactedModelOverride };

export interface CatalogDraft {
	mode: CatalogMode;
	models: RedactedModelDefinition[];
	overrides: Record<string, RedactedModelOverride>;
	/** Keys seen in the last discovery result, used to surface provenance in the UI. */
	discoveredIds: string[];
}

export const EMPTY_DRAFT: CatalogDraft = {
	mode: "dynamic",
	models: [],
	overrides: {},
	discoveredIds: [],
};

export function deriveMode(
	current: RedactedModelDefinition[] | undefined,
	overrides: Record<string, RedactedModelOverride> | undefined,
	registryAvailable: number,
): CatalogMode {
	const hasModels = !!current && current.length > 0;
	const hasOverrides = !!overrides && Object.keys(overrides).length > 0;
	if (!hasModels && !hasOverrides && registryAvailable > 0) return "dynamic";
	if (!hasModels && hasOverrides) return "dynamic";
	if (hasModels && !hasOverrides) return "pinned";
	if (hasModels && hasOverrides) return "hybrid";
	return "builtin";
}

export function catalogBase(
	current: CatalogDraft,
	incoming: RedactedModelDefinition[],
	previousDiscovered: string[] = [],
): CatalogDraft {
	const seen = new Set(incoming.map((m) => m.id));
	return {
		...current,
		models: incoming,
		discoveredIds: Array.from(new Set([...previousDiscovered, ...seen])),
	};
}

export function addDiscoveredModels(
	current: CatalogDraft,
	discovered: RedactedModelDefinition[],
): CatalogDraft {
	const existingIds = new Set(current.models.map((model) => model.id));
	const additions = discovered.filter((model) => !existingIds.has(model.id));
	return {
		...current,
		models: [...current.models, ...additions],
		discoveredIds: Array.from(
			new Set([...current.discoveredIds, ...discovered.map((model) => model.id)]),
		),
	};
}

export function applyAction(draft: CatalogDraft, action: ModelAction): CatalogDraft {
	switch (action.kind) {
		case "add": {
			if (!draft.models.find((m) => m.id === action.model.id)) {
				return { ...draft, models: [...draft.models, action.model] };
			}
			return draft;
		}
		case "edit": {
			const nextModels = draft.models.map((m) =>
				m.id === action.id ? mergeModel(m, action.patch) : m,
			);
			return { ...draft, models: nextModels };
		}
		case "duplicate": {
			const source = draft.models.find((m) => m.id === action.id);
			if (!source) return draft;
			const newId = action.newId ?? cloneId(action.id);
			const duplicate: RedactedModelDefinition = {
				...source,
				id: newId,
				name: `${source.name ?? source.id} (copy)`,
			};
			if (draft.models.find((m) => m.id === newId)) return draft;
			return { ...draft, models: [...draft.models, duplicate] };
		}		case "remove": {
			const nextModels = draft.models.filter((m) => m.id !== action.id);
			const nextOverrides = { ...draft.overrides };
			delete nextOverrides[action.id];
			return { ...draft, models: nextModels, overrides: nextOverrides };
		}
		case "configure": {
			const nextOverrides = { ...draft.overrides };
			if (action.override) nextOverrides[action.id] = action.override;
			else delete nextOverrides[action.id];
			return { ...draft, overrides: nextOverrides };
		}
	}
}

export function mergeModel(
	base: RedactedModelDefinition,
	patch: Partial<RedactedModelDefinition>,
): RedactedModelDefinition {
	const next: RedactedModelDefinition = { ...base };
	if (patch.id !== undefined && patch.id !== base.id) {
		next.id = patch.id;
	}
	if (patch.name !== undefined) next.name = patch.name;
	if (patch.api !== undefined) next.api = patch.api as ModelProviderApi;
	if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl;
	if (patch.reasoning !== undefined) next.reasoning = patch.reasoning;
	if (patch.thinking !== undefined) next.thinking = patch.thinking;
	if (patch.input !== undefined) next.input = patch.input;
	if (patch.supportsTools !== undefined) next.supportsTools = patch.supportsTools;
	if (patch.cost !== undefined) next.cost = patch.cost;
	if (patch.premiumMultiplier !== undefined) next.premiumMultiplier = patch.premiumMultiplier;
	if (patch.contextWindow !== undefined) next.contextWindow = patch.contextWindow;
	if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens;
	if (patch.omitMaxOutputTokens !== undefined) next.omitMaxOutputTokens = patch.omitMaxOutputTokens;
	if (patch.headers !== undefined) next.headers = patch.headers;
	if (patch.compat !== undefined) next.compat = patch.compat;
	if (patch.contextPromotionTarget !== undefined) next.contextPromotionTarget = patch.contextPromotionTarget;
	if (patch.compactionModel !== undefined) next.compactionModel = patch.compactionModel;
	if (patch.remoteCompaction !== undefined) next.remoteCompaction = patch.remoteCompaction;
	return next;
}

export function cloneId(base: string): string {
	const dashIndex = base.lastIndexOf("-");
	if (dashIndex > 0 && /^\d+$/.test(base.slice(dashIndex + 1))) {
		const next = Number(base.slice(dashIndex + 1)) + 1;
		return `${base.slice(0, dashIndex)}-${next}`;
	}
	return `${base}-copy`;
}

export function suggestUniqueId(
	base: string,
	existing: Iterable<string>,
): string {
	const conflict = new Set(existing);
	let candidate = cloneId(base);
	while (conflict.has(candidate)) {
		candidate = cloneId(candidate);
	}
	return candidate;
}

export function modelSourceLabel(
	model: RedactedModelDefinition,
	discoveredIds: string[],
): "configured" | "remote" | "edited" {
	if (model.name && /\(copy\)$/.test(model.name)) return "edited";
	if (!discoveredIds.includes(model.id)) return "configured";
	return "remote";
}

export function validateModelDraft(model: Partial<RedactedModelDefinition>): string[] {
	const issues: string[] = [];
	if (!model.id || typeof model.id !== "string" || model.id.trim().length === 0) {
		issues.push("id is required");
	}
	const context = Number(model.contextWindow);
	if (model.contextWindow !== undefined && (!Number.isFinite(context) || context <= 0)) {
		issues.push("contextWindow must be positive");
	}
	const max = Number(model.maxTokens);
	if (model.maxTokens !== undefined && (!Number.isFinite(max) || max <= 0)) {
		issues.push("maxTokens must be positive");
	}
	const cost = model.cost as Partial<RedactedModelDefinition["cost"]> | undefined;
	if (cost) {
		for (const [key, value] of Object.entries(cost)) {
			if (typeof value !== "number" || !Number.isFinite(value)) issues.push(`cost.${key} must be numeric`);
		}
	}
	if (model.thinking) {
		const { mode, efforts } = model.thinking;
		if (mode === "effort" && (!efforts || efforts.length === 0)) {
			issues.push("thinking.efforts is required when mode is effort");
		}
	}
	if (model.input) {
		for (const modality of model.input) {
			if (modality !== "text" && modality !== "image") issues.push(`unknown input: ${modality}`);
		}
	}
	return issues;
}

export function isDuplicateId(id: string, existing: RedactedModelDefinition[]): boolean {
	return existing.some((m) => m.id === id);
}

export function projectEditedModel(
	draft: RedactedModelDefinition,
	saved: RedactedModelDefinition,
): Partial<RedactedModelDefinition> {
	const next: Partial<RedactedModelDefinition> = {};
	for (const key of Object.keys(draft) as Array<keyof RedactedModelDefinition>) {
		if (key === "headers" || key === "compat" || key === "remoteCompaction") continue;
		if (!sameValue(draft[key], saved[key])) {
			(next as Record<string, unknown>)[key] = draft[key];
		}
	}
	return next;
}

export function sparsePersist(
	draft: RedactedModelDefinition,
	saved: RedactedModelDefinition,
): Partial<RedactedModelDefinition> {
	return projectEditedModel(draft, saved);
}

function sameValue(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((entry, idx) => entry === b[idx]);
	}
	if (a && typeof a === "object" && b && typeof b === "object") {
		const aKeys = Object.keys(a as Record<string, unknown>);
		const bKeys = Object.keys(b as Record<string, unknown>);
		if (aKeys.length !== bKeys.length) return false;
		for (const key of aKeys) {
			if (!sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
				return false;
			}
		}
		return true;
	}
	return false;
}

export function redactHeadersForCatalog(
	headers: Record<string, string> | undefined,
	sentinel: string,
): Record<string, string> {
	if (!headers) return {};
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		out[key] = value.includes(sentinel) ? sentinel : value;
	}
	return out;
}

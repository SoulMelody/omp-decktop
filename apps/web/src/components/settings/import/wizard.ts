import type {
	ModelProviderApi,
	ProviderImportCollisionAction,
	ProviderImportMapping,
} from "@omp-deck/protocol";

export type WizardStage = "scan" | "select" | "map" | "preview" | "commit" | "done";

export interface PendingCandidate {
	sourceKey: string;
	proposedTargetId: string;
	displayName: string;
	selected: boolean;
	suggestedApi?: ModelProviderApi;
	baseUrl?: string;
}

export interface DraftMapping extends ProviderImportMapping {
	sourceKey: string;
	displayName: string;
	proposedTargetId: string;
}

export function buildDefaultMappings(
	candidates: PendingCandidate[],
	defaultApi: ModelProviderApi,
): DraftMapping[] {
	return candidates
		.filter((candidate) => candidate.selected)
		.map<DraftMapping>((candidate) => ({
			sourceKey: candidate.sourceKey,
			displayName: candidate.displayName,
			proposedTargetId: candidate.proposedTargetId,
			targetId: candidate.proposedTargetId,
			api: candidate.suggestedApi ?? defaultApi,
			baseUrl: candidate.baseUrl,
			migrateCredential: true,
			catalogStrategy: "dynamic",
			collisionAction: "new",
		}));
}

export function pipelineStage(stage: WizardStage, status: WizardStatus): WizardStage {
	if (status === "failed") return stage;
	if (status === "done") return "done";
	return stage;
}

export type WizardStatus = "idle" | "running" | "failed" | "done";

export function summariseStatus(mappings: DraftMapping[]): {
	selected: number;
	ready: number;
	blocked: number;
} {
	let selected = 0;
	let ready = 0;
	let blocked = 0;
	for (const mapping of mappings) {
		if (mapping.migrateCredential) selected += 1;
		if (mapping.collisionAction === "replace" && !mapping.confirmReplace) {
			blocked += 1;
		} else if (mapping.collisionAction !== "skip") {
			ready += 1;
		}
	}
	return { selected, ready, blocked };
}

export function migrateCredentialAction(
	mapping: DraftMapping,
): "set" | "preserve" | "remove" {
	if (!mapping.migrateCredential) return "preserve";
	return "set";
}

export function isReplacing(mapping: DraftMapping): boolean {
	return mapping.collisionAction === "replace" && !mapping.confirmReplace;
}

export function applyReplaceConfirmation(mapping: DraftMapping, confirmed: boolean): DraftMapping {
	return {
		...mapping,
		collisionAction: confirmed ? "replace" : mapping.collisionAction,
		confirmReplace: confirmed,
	};
}

export function remapCollision(
	mapping: DraftMapping,
	action: ProviderImportCollisionAction,
): DraftMapping {
	const allowed: ProviderImportCollisionAction[] = ["new", "skip", "merge", "replace"];
	if (!allowed.includes(action)) return mapping;
	return {
		...mapping,
		collisionAction: action,
		confirmReplace: action === "replace" ? true : mapping.confirmReplace,
	};
}

export function filterMappings(mappings: DraftMapping[], query: string): DraftMapping[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return mappings;
	return mappings.filter((mapping) => {
		const haystack = `${mapping.displayName} ${mapping.targetId} ${mapping.sourceKey}`.toLowerCase();
		return haystack.includes(needle);
	});
}

export function stageOrder(stage: WizardStage): WizardStage[] {
	return ["scan", "select", "map", "preview", "commit", "done"];
}

export function stageIndex(stage: WizardStage): number {
	return stageOrder(stage).indexOf(stage);
}

export function stageProgress(stage: WizardStage): { done: number; total: number } {
	const total = stageOrder(stage).length - 1;
	const done = Math.max(stageIndex(stage), 0);
	return { done, total };
}

export function isReplacementConfirmed(mapping: DraftMapping): boolean {
	if (mapping.collisionAction !== "replace") return true;
	return mapping.confirmReplace === true;
}

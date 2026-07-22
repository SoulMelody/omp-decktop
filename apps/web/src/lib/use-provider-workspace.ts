import { useCallback, useEffect, useRef, useState } from "react";
import {
	DiscoverModelsRequest,
	ModelProviderRecord,
	ProviderCredentialOperation,
	ProviderImportMapping,
	PreviewProviderImportRequest,
	ProbeProviderRequest,
	PutModelProviderRequest,
	type DiscoverModelsResponse,
	type ListModelProvidersResponse,
	type ProbeProviderResponse,
	type RedactedProviderDefinition,
	type ScanProviderImportsResponse,
} from "@omp-deck/protocol";

import { ProviderApiError, modelProviderApi } from "./model-providers-api";
import { useStore } from "./store";

export type WorkspaceFilter = "all" | "ready" | "needs-attention" | "legacy";

export interface ProviderWorkspaceError {
	code: string;
	message: string;
	issues?: Array<{ path: string; message: string }>;
}

export interface ProviderWorkspaceState {
	status: "idle" | "loading" | "ready" | "error";
	list?: ListModelProvidersResponse;
	selectedId?: string;
	filter: WorkspaceFilter;
	search: string;
	saving: boolean;
	error?: ProviderWorkspaceError;
	conflictRevision?: string;
}

const EMPTY_STATE: ProviderWorkspaceState = {
	status: "idle",
	filter: "all",
	search: "",
	saving: false,
};

export function resolveSelectedProviderId(
	selectedId: string | undefined,
	providers: Array<Pick<ModelProviderRecord, "id">>,
): string | undefined {
	return selectedId && providers.some((provider) => provider.id === selectedId)
		? selectedId
		: providers[0]?.id;
}

export function useProviderWorkspace(): {
	state: ProviderWorkspaceState;
	refresh: () => Promise<void>;
	select: (id: string | undefined) => void;
	applyFilter: (filter: WorkspaceFilter) => void;
	applySearch: (search: string) => void;
	saveDraft: (
		id: string,
		definition: RedactedProviderDefinition,
		credential: ProviderCredentialOperation,
	) => Promise<void>;
	remove: (id: string, revision: string) => Promise<void>;
	discover: (request: DiscoverModelsRequest) => Promise<DiscoverModelsResponse>;
	probe: (request: ProbeProviderRequest) => Promise<ProbeProviderResponse>;
	scanImports: () => Promise<ScanProviderImportsResponse>;
	previewImport: (
		mappings: ProviderImportMapping[],
	) => Promise<{ entries: PreviewProviderImportRequest; response: Awaited<ReturnType<typeof modelProviderApi.previewImport>> }>;
	commitImport: (request: PreviewProviderImportRequest, previewToken: string) => Promise<unknown>;
	discoverLegacy: () => Promise<Array<{ id: string; location: string }>>;
} {
	const [state, setState] = useState<ProviderWorkspaceState>(EMPTY_STATE);
	const abortRef = useRef<AbortController | undefined>(undefined);
	const modelsChangeCounter = useStore((s) => s.modelsChangeCounter);

	const refresh = useCallback(async () => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setState((s) => ({ ...s, status: s.list ? s.status : "loading", error: undefined }));
		try {
			const list = await modelProviderApi.listProviders(controller.signal);
			if (controller.signal.aborted || abortRef.current !== controller) return;
			setState((s) => ({
				...s,
				status: "ready",
				list,
				selectedId: resolveSelectedProviderId(s.selectedId, list.providers),
				error: undefined,
				conflictRevision: undefined,
			}));
		} catch (error) {
			if (controller.signal.aborted) return;
			setState((s) => ({
				...s,
				status: "error",
				error: serializeError(error),
			}));
		}
	}, []);

	useEffect(() => {
		void refresh();
		return () => abortRef.current?.abort();
	}, [refresh, modelsChangeCounter]);

	const select = useCallback((id: string | undefined) => {
		setState((s) => ({
			...s,
			selectedId: id,
			saving: false,
			error: undefined,
			conflictRevision: undefined,
		}));
	}, []);

	const applyFilter = useCallback((filter: WorkspaceFilter) => {
		setState((s) => ({ ...s, filter }));
	}, []);
	const applySearch = useCallback((search: string) => {
		setState((s) => ({ ...s, search }));
	}, []);

	const saveDraft = useCallback(
		async (id: string, definition: RedactedProviderDefinition, credential: ProviderCredentialOperation) => {
			const revision = state.list?.revision;
			if (!revision) throw new Error("missing workspace revision");
			setState((s) => ({ ...s, saving: true, error: undefined }));
			try {
				const body: PutModelProviderRequest = {
					revision,
					definition,
					credential,
				};
				await modelProviderApi.putProvider(id, body);
				setState((s) => ({ ...s, saving: false, conflictRevision: undefined, error: undefined }));
				await refresh();
			} catch (error) {
				const serialized = serializeError(error);
				setState((s) => ({
					...s,
					saving: false,
					error: serialized,
					conflictRevision: serialized.code === "revision-conflict" ? state.list?.revision : undefined,
				}));
				throw error;
			}
		},
		[state.list?.revision, refresh],
	);

	const remove = useCallback(async (id: string, revision: string) => {
		setState((s) => ({ ...s, saving: true, error: undefined }));
		try {
			const list = await modelProviderApi.deleteProvider(id, { revision, confirm: true });
			setState((s) => ({
				...s,
				status: "ready",
				list,
				saving: false,
				selectedId: resolveSelectedProviderId(undefined, list.providers),
				error: undefined,
				conflictRevision: undefined,
			}));
		} catch (error) {
			setState((s) => ({ ...s, saving: false, error: serializeError(error) }));
			throw error;
		}
	}, []);

	const discover = useCallback(async (request: DiscoverModelsRequest) => {
		return modelProviderApi.discover(request);
	}, []);

	const probe = useCallback(async (request: ProbeProviderRequest) => {
		return modelProviderApi.probe(request);
	}, []);

	const scanImports = useCallback(async () => modelProviderApi.scanImports(), []);

	const previewImport = useCallback(async (mappings: ProviderImportMapping[]) => {
		if (!state.list) throw new Error("missing workspace revision");
		const fingerprint = (await scanImports()).fingerprint ?? "";
		const request: PreviewProviderImportRequest = {
			revision: state.list.revision,
			sourceFingerprint: fingerprint,
			mappings,
		};
		const response = await modelProviderApi.previewImport(request);
		return { entries: request, response };
	}, [state.list, scanImports]);

	const commitImport = useCallback(async (request: PreviewProviderImportRequest, previewToken: string) => {
		return modelProviderApi.commitImport({ ...request, previewToken });
	}, []);

	const discoverLegacy = useCallback(async () => {
		const response = await modelProviderApi.discoverLegacy();
		return response.extensions;
	}, []);

	return {
		state,
		refresh,
		select,
		applyFilter,
		applySearch,
		saveDraft,
		remove,
		discover,
		probe,
		scanImports,
		previewImport,
		commitImport,
		discoverLegacy,
	};
}

function serializeError(error: unknown): ProviderWorkspaceError {
	if (error instanceof ProviderApiError) {
		return {
			code: error.code,
			message: error.message,
			issues: error.issues.length > 0 ? error.issues : undefined,
		};
	}
	return {
		code: "unknown",
		message: error instanceof Error ? error.message : "unknown error",
	};
}


import {
	DiscoverModelsRequest,
	DiscoverModelsResponse,
	ListModelProvidersResponse,
	ModelProviderMutationResponse,
	PreviewProviderImportRequest,
	PreviewProviderImportResponse,
	ProbeProviderRequest,
	ProbeProviderResponse,
	ProviderImportMapping,
	PutModelProviderRequest,
	ScanProviderImportsResponse,
	type CommitProviderImportRequest,
	type CommitProviderImportResponse,
	type DeleteModelProviderRequest,
	type LegacyProviderMutationResponse,
	type MigrateLegacyProviderRequest,
	type RollbackLegacyProviderRequest,
} from "@omp-deck/protocol";

export class ProviderApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly issues: Array<{ path: string; message: string }> = [],
		readonly revision?: string,
	) {
		super(message);
		this.name = "ProviderApiError";
	}
}

async function request<T>(input: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(input, {
		...init,
		headers: {
			"content-type": "application/json",
			accept: "application/json",
			...(init.headers ?? {}),
		},
	});
	if (!response.ok) {
		const body = (await safeJson(response)) as null | {
			error?: string;
			message?: string;
			revision?: string;
			issues?: Array<{ path: string; message: string }>;
		};
		const code = typeof body?.error === "string" ? body.error : "http-error";
		const message = typeof body?.message === "string" ? body.message : response.statusText;
		const revision = typeof body?.revision === "string" ? body.revision : undefined;
		const issues = Array.isArray(body?.issues) ? body.issues : [];
		throw new ProviderApiError(response.status, code, message, issues, revision);
	}
	return (await safeJson(response)) as T;
}

async function safeJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch (error) {
		if (isAbortError(error)) throw error;
		return null;
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function requireProviderList(body: ListModelProvidersResponse | null): ListModelProvidersResponse {
	if (!body || !Array.isArray(body.providers)) {
		throw new ProviderApiError(502, "invalid-response", "Model provider list returned an invalid response.");
	}
	return body;
}

export const modelProviderApi = {
	async listProviders(signal?: AbortSignal): Promise<ListModelProvidersResponse> {
		const body = await request<ListModelProvidersResponse | null>("/api/model-providers", { signal });
		return requireProviderList(body);
	},

	putProvider(
		id: string,
		body: PutModelProviderRequest,
		signal?: AbortSignal,
	): Promise<ModelProviderMutationResponse> {
		return request<ModelProviderMutationResponse>(`/api/model-providers/${encodeURIComponent(id)}`, {
			method: "PUT",
			body: JSON.stringify(body),
			signal,
		});
	},

	async deleteProvider(
		id: string,
		body: DeleteModelProviderRequest,
		signal?: AbortSignal,
	): Promise<ListModelProvidersResponse> {
		const response = await request<ListModelProvidersResponse | null>(`/api/model-providers/${encodeURIComponent(id)}`, {
			method: "DELETE",
			body: JSON.stringify(body),
			signal,
		});
		return requireProviderList(response);
	},

	discover(body: DiscoverModelsRequest, signal?: AbortSignal): Promise<DiscoverModelsResponse> {
		return request<DiscoverModelsResponse>("/api/model-providers/discover", {
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
	},

	probe(body: ProbeProviderRequest, signal?: AbortSignal): Promise<ProbeProviderResponse> {
		return request<ProbeProviderResponse>("/api/model-providers/probe", {
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
	},

	refreshProvider(
		id: string,
		signal?: AbortSignal,
	): Promise<{
		providerId: string;
		modelCount: number;
		discovery?: unknown;
	}> {
		return request(`/api/model-providers/${encodeURIComponent(id)}/refresh`, {
			method: "POST",
			body: "{}",
			signal,
		});
	},

	scanImports(signal?: AbortSignal): Promise<ScanProviderImportsResponse> {
		return request<ScanProviderImportsResponse>("/api/model-providers/imports", { signal });
	},

	previewImport(
		body: PreviewProviderImportRequest,
		signal?: AbortSignal,
	): Promise<PreviewProviderImportResponse> {
		return request<PreviewProviderImportResponse>("/api/model-providers/imports/preview", {
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
	},

	commitImport(
		body: CommitProviderImportRequest,
		signal?: AbortSignal,
	): Promise<CommitProviderImportResponse> {
		return request<CommitProviderImportResponse>("/api/model-providers/imports/commit", {
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
	},

	migrateLegacy(
		body: MigrateLegacyProviderRequest,
		signal?: AbortSignal,
	): Promise<LegacyProviderMutationResponse> {
		return request<LegacyProviderMutationResponse>("/api/model-providers/legacy/migrate", {
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
	},

	rollbackLegacy(
		body: RollbackLegacyProviderRequest,
		signal?: AbortSignal,
	): Promise<LegacyProviderMutationResponse> {
		return request<LegacyProviderMutationResponse>("/api/model-providers/legacy/rollback", {
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
	},

	discoverLegacy(): Promise<{ extensions: Array<{ id: string; location: string }> }> {
		return request("/api/model-providers/legacy/discover");
	},
};

export type ProviderMapping = ProviderImportMapping;

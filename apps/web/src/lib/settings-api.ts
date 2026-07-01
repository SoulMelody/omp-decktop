import type {
	AgentConfigResponse,
	ListEnvSettingsResponse,
	ModelRolesResponse,
	PatchEnvSettingsRequest,
	PatchEnvSettingsResponse,
	RestartServerResponse,
	RevealEnvValueResponse,
	UpdateAgentConfigRequest,
	UpdateLspConfigRequest,
	LspConfigResponse,
	ProjectLspConfigResponse,
	UpdateModelRolesRequest,
} from "@omp-deck/protocol";

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`HTTP ${res.status} ${path}: ${body}`);
	}
	return (await res.json()) as T;
}

export const settingsApi = {
	listEnv(): Promise<ListEnvSettingsResponse> {
		return req<ListEnvSettingsResponse>("/settings/env");
	},
	patchEnv(updates: PatchEnvSettingsRequest["updates"]): Promise<PatchEnvSettingsResponse> {
		return req<PatchEnvSettingsResponse>("/settings/env", {
			method: "PATCH",
			body: JSON.stringify({ updates } satisfies PatchEnvSettingsRequest),
		});
	},
	revealEnv(key: string): Promise<RevealEnvValueResponse> {
		return req<RevealEnvValueResponse>(`/settings/env/${encodeURIComponent(key)}?reveal=1`);
	},
	restartServer(): Promise<RestartServerResponse> {
		return req<RestartServerResponse>("/server/restart", { method: "POST" });
	},
	getAgentConfig(): Promise<AgentConfigResponse> {
		return req<AgentConfigResponse>("/settings/agent-config");
	},
	updateAgentConfig(updates: UpdateAgentConfigRequest["updates"]): Promise<{ ok: true }> {
		return req<{ ok: true }>("/settings/agent-config", {
			method: "PUT",
			body: JSON.stringify({ updates } satisfies UpdateAgentConfigRequest),
		});
	},
	getLspConfig(): Promise<LspConfigResponse> {
		return req<LspConfigResponse>("/settings/lsp");
	},
	updateLspConfig(body: UpdateLspConfigRequest): Promise<{ ok: true }> {
		return req<{ ok: true }>("/settings/lsp", { method: "PUT", body: JSON.stringify(body) });
	},
	getWorkspaceLsp(cwd: string): Promise<ProjectLspConfigResponse> {
		return req<ProjectLspConfigResponse>(`/workspaces/${encodeURIComponent(cwd)}/lsp`);
	},
	updateWorkspaceLsp(cwd: string, body: UpdateLspConfigRequest): Promise<{ ok: true }> {
		return req<{ ok: true }>(`/workspaces/${encodeURIComponent(cwd)}/lsp`, { method: "PUT", body: JSON.stringify(body) });
	},
	modelRoles: {
		list(): Promise<ModelRolesResponse> {
			return req<ModelRolesResponse>("/settings/model-roles");
		},
		save(roles: Record<string, string | null>): Promise<{ ok: true }> {
			return req<{ ok: true }>("/settings/model-roles", {
				method: "PUT",
				body: JSON.stringify({ roles } satisfies UpdateModelRolesRequest),
			});
		},
		clear(role: string): Promise<{ ok: true }> {
			return req<{ ok: true }>(`/settings/model-roles/${encodeURIComponent(role)}`, {
				method: "DELETE",
			});
		},
		resetAll(): Promise<{ ok: true }> {
			return req<{ ok: true }>("/settings/model-roles", {
				method: "DELETE",
			});
		},
	},
};

import type {
	CreateSessionRequest,
	CreateSessionResponse,
	ListFilePathsResponse,
	ListModelsResponse,
	ListSessionsResponse,
	ListSlashCommandsResponse,
	ListWorkspacesResponse,
	McpCreateRequest,
	McpListResponse,
	McpServerConfigWire,
	McpTestResponse,
	McpUpdateRequest,
	ModelRef,
} from "@omp-deck/protocol";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			"content-type": "application/json",
			...(init?.headers ?? {}),
		},
	});
	if (!res.ok) {
		let body: string;
		try {
			body = await res.text();
		} catch {
			body = "(unreadable body)";
		}
		throw new Error(`HTTP ${res.status} ${path}: ${body}`);
	}
	return (await res.json()) as T;
}

export const api = {
	listWorkspaces(): Promise<ListWorkspacesResponse> {
		return request<ListWorkspacesResponse>("/workspaces");
	},
	listSessions(cwd?: string): Promise<ListSessionsResponse> {
		const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
		return request<ListSessionsResponse>(`/sessions${q}`);
	},
	createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
		return request<CreateSessionResponse>("/sessions", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},
	abortSession(id: string): Promise<{ ok: true }> {
		return request(`/sessions/${encodeURIComponent(id)}/abort`, { method: "POST" });
	},
	renameSession(id: string, name: string): Promise<{ ok: true; sessionId: string }> {
		return request(`/sessions/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify({ name }),
		});
	},
	listModels(sessionId?: string): Promise<ListModelsResponse> {
		const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
		return request<ListModelsResponse>(`/models${q}`);
	},
	setSessionModel(id: string, model: ModelRef): Promise<{ ok: true; sessionId: string }> {
		return request(`/sessions/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify({ model }),
		});
	},
	compactSession(id: string, focus?: string): Promise<{ ok: true }> {
		const body = focus && focus.trim().length > 0 ? JSON.stringify({ focus: focus.trim() }) : undefined;
		const init: RequestInit = body
			? { method: "POST", body, headers: { "content-type": "application/json" } }
			: { method: "POST" };
		return request(`/sessions/${encodeURIComponent(id)}/compact`, init);
	},
	disposeSession(id: string): Promise<{ ok: true }> {
		return request(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
	},
	branchPoints(id: string): Promise<{ points: { entryId: string; text: string }[] }> {
		return request(`/sessions/${encodeURIComponent(id)}/branch-points`);
	},
	forkSession(id: string): Promise<{ ok: true }> {
		return request(`/sessions/${encodeURIComponent(id)}/fork`, { method: "POST" });
	},
	branchSession(id: string, entryId: string): Promise<{ ok: true; selectedText: string }> {
		return request(`/sessions/${encodeURIComponent(id)}/branch`, {
			method: "POST",
			body: JSON.stringify({ entryId }),
		});
	},
	rewindSession(id: string, entryId: string): Promise<{ ok: true; editorText?: string }> {
		return request(`/sessions/${encodeURIComponent(id)}/rewind`, {
			method: "POST",
			body: JSON.stringify({ entryId }),
		});
	},
	listSlashCommands(cwd?: string): Promise<ListSlashCommandsResponse> {
		const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
		return request<ListSlashCommandsResponse>(`/slash-commands${q}`);
	},
	completeFilePath(cwd: string, q: string, limit = 20): Promise<ListFilePathsResponse> {
		const params = new URLSearchParams({ cwd, q, limit: String(limit) });
		return request<ListFilePathsResponse>(`/fs/complete?${params.toString()}`);
	},
	patchEnv(updates: Record<string, string | null>): Promise<{ appliedHot?: string[] }> {
		return request(`/settings/env`, {
			method: "PATCH",
			body: JSON.stringify({ updates }),
		});
	},
	listMcpServers(): Promise<McpListResponse> {
		return request<McpListResponse>("/mcp");
	},
	addMcpServer(body: McpCreateRequest): Promise<{ ok: true }> {
		return request("/mcp", { method: "POST", body: JSON.stringify(body) });
	},
	updateMcpServer(name: string, body: McpUpdateRequest): Promise<{ ok: true }> {
		return request(`/mcp/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(body) });
	},
	deleteMcpServer(name: string): Promise<{ ok: true }> {
		return request(`/mcp/${encodeURIComponent(name)}`, { method: "DELETE" });
	},
	toggleMcpServer(name: string): Promise<{ ok: true; disabled: boolean }> {
		return request(`/mcp/${encodeURIComponent(name)}/toggle`, { method: "POST" });
	},
	testMcpConnection(name: string): Promise<McpTestResponse> {
		return request<McpTestResponse>(`/mcp/${encodeURIComponent(name)}/test`, { method: "POST" });
	},
};

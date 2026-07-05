import type {
	CreateSkillRequest,
	CreateSkillResponse,
	DeleteSkillResponse,
	InstallSkillFromNpmRequest,
	InstallSkillFromNpmResponse,
	InstallSkillFromUrlRequest,
	InstallSkillFromUrlResponse,
	ListNpmSkillsResponse,
	ListSkillsResponse,
	SkillDetailResponse,
	UpdateSkillRequest,
	UpdateSkillResponse,
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

function withCwd(path: string, cwd: string | undefined): string {
	if (!cwd) return path;
	const sep = path.includes("?") ? "&" : "?";
	return `${path}${sep}cwd=${encodeURIComponent(cwd)}`;
}

export const skillsApi = {
	list(cwd?: string): Promise<ListSkillsResponse> {
		return req<ListSkillsResponse>(withCwd("/skills", cwd));
	},
	detail(id: string, cwd?: string): Promise<SkillDetailResponse> {
		return req<SkillDetailResponse>(withCwd(`/skills/${encodeURIComponent(id)}`, cwd));
	},
	create(body: CreateSkillRequest): Promise<CreateSkillResponse> {
		return req<CreateSkillResponse>("/skills", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},
	update(id: string, body: UpdateSkillRequest): Promise<UpdateSkillResponse> {
		return req<UpdateSkillResponse>(`/skills/${encodeURIComponent(id)}`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},
	deleteSkill(id: string, cwd?: string): Promise<DeleteSkillResponse> {
		return req<DeleteSkillResponse>(withCwd(`/skills/${encodeURIComponent(id)}`, cwd), {
			method: "DELETE",
		});
	},
	installFromUrl(body: InstallSkillFromUrlRequest): Promise<InstallSkillFromUrlResponse> {
		return req<InstallSkillFromUrlResponse>("/skills/install", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},
	installFromNpm(body: InstallSkillFromNpmRequest): Promise<InstallSkillFromNpmResponse> {
		return req<InstallSkillFromNpmResponse>("/skills/npm/add", {
			method: "POST",
			body: JSON.stringify(body),
		});
	},
	listNpm(scope?: "user" | "project" | "all"): Promise<ListNpmSkillsResponse> {
		return req<ListNpmSkillsResponse>("/skills/npm/list", {
			method: "POST",
			body: JSON.stringify({ scope }),
		});
	},
};
import type { ListSkillsResponse, SkillDetailResponse } from "@omp-deck/protocol";

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

export const skillsApi = {
	list(): Promise<ListSkillsResponse> {
		return req<ListSkillsResponse>("/skills");
	},
	detail(pluginId: string, skillName: string): Promise<SkillDetailResponse> {
		// pluginId is `name@marketplace`. Hono auto-decodes path params, so
		// either form works on the wire — but stay strict about encoding here
		// because future callers may pick up `/`-containing names.
		return req<SkillDetailResponse>(
			`/skills/${encodeURIComponent(pluginId)}/${encodeURIComponent(skillName)}`,
		);
	},
};

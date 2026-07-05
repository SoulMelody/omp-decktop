import { describe, expect, test } from "bun:test";
import * as path from "node:path";

import type { InstallSkillFromNpmRequest, InstallSkillFromNpmResponse } from "@omp-deck/protocol";

import type { Config } from "./config.ts";
import { MarketplaceService } from "./marketplace-service.ts";
import { buildSkillsRouter } from "./routes-skills.ts";
import { SkillsService } from "./skills-service.ts";

function installError(message: string, status: number): Error & { status: number } {
	const err = new Error(message) as Error & { status: number };
	err.status = status;
	return err;
}

const TEST_CONFIG: Config = {
	host: "127.0.0.1",
	port: 0,
	defaultCwd: path.resolve("."),
	extraWorkspaces: [],
	devMode: true,
	idleTimeoutMs: 0,
	dbPath: path.resolve("deck.db"),
	uploadsRoot: path.resolve("uploads"),
	autoStartCommand: null,
};

class InstallOnlySkillsService extends SkillsService {
	constructor(private readonly install: (req: InstallSkillFromNpmRequest) => Promise<InstallSkillFromNpmResponse>) {
		super(TEST_CONFIG, new MarketplaceService());
	}

	override async installFromNpm(req: InstallSkillFromNpmRequest): Promise<InstallSkillFromNpmResponse> {
		return this.install(req);
	}
}

describe("POST /skills/npm/add", () => {
	test.each([
		{ status: 502, message: "bunx skills add failed: network error" },
	])("propagates installFromNpm $status failures", async ({ status, message }) => {
		const app = buildSkillsRouter(
			new InstallOnlySkillsService(async () => {
				throw installError(message, status);
			}),
		);

		const res = await app.request("/skills/npm/add", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ source: { source: "owner/repo" } }),
		});

		expect(res.status).toBe(status);
		expect(await res.json()).toEqual({ error: message });
	});
});
import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { Config } from "./config.ts";
import type { MarketplaceService } from "./marketplace-service.ts";
import { SkillsService } from "./skills-service.ts";

let workdir: string | null = null;
const originalFetch = globalThis.fetch;

afterEach(async () => {
	globalThis.fetch = originalFetch;
	if (workdir) {
		await fs.rm(workdir, { recursive: true, force: true }).catch(() => undefined);
		workdir = null;
	}
});

async function boot(): Promise<string> {
	workdir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-deck-skills-install-"));
	return workdir;
}

function makeConfig(defaultCwd: string): Config {
	return {
		host: "127.0.0.1",
		port: 0,
		defaultCwd,
		extraWorkspaces: [],
		devMode: true,
		idleTimeoutMs: 0,
		dbPath: path.join(defaultCwd, "deck.db"),
		uploadsRoot: path.join(defaultCwd, "uploads"),
		autoStartCommand: null,
	};
}

function makeService(defaultCwd: string): SkillsService {
	return new SkillsService(makeConfig(defaultCwd), {} as MarketplaceService);
}

function textSkill(name: string): string {
	return `---\nname: ${name}\n---\n# ${name}\n\nUse this skill when testing install behavior.\n`;
}

async function expectRejectsWithStatus(promise: Promise<unknown>, status: number, message: RegExp): Promise<void> {
	try {
		await promise;
		throw new Error("expected promise to reject");
	} catch (err) {
		if (!(err instanceof Error)) throw err;
		expect(err.message).toMatch(message);
		if (!("status" in err)) throw new Error("expected rejection to expose an HTTP status");
		expect(err.status).toBe(status);
	}
}


describe("SkillsService.installFromNpm", () => {
	test("handles bunx skills add failure gracefully", async () => {
		const root = await boot();
		const service = makeService(root);

		// Invalid source that bunx skills add will reject
		await expectRejectsWithStatus(
			service.installFromNpm({ source: { source: "invalid-source-format" }, scope: "project", cwd: root }),
			502,
			/bunx skills add failed/,
		);
	});
});

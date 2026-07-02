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

describe("SkillsService.installFromUrl", () => {
	test("rejects non-http URLs before writing into the project skills root", async () => {
		const root = await boot();
		const service = makeService(root);

		await expectRejectsWithStatus(
			service.installFromUrl({ scope: "project", cwd: root, url: "file:///tmp/SKILL.md" }),
			400,
			/http or https/,
		);

		const entries = await fs.readdir(path.join(root, ".omp", "skills")).catch(() => []);
		expect(entries).toEqual([]);
	});

	test("refuses to overwrite an existing project skill directory", async () => {
		const root = await boot();
		const service = makeService(root);
		const existingSkillPath = path.join(root, ".omp", "skills", "colliding-skill", "SKILL.md");
		await fs.mkdir(path.dirname(existingSkillPath), { recursive: true });
		await fs.writeFile(existingSkillPath, "original skill body", "utf8");
		globalThis.fetch = (async () =>
			new Response(textSkill("Colliding Skill"), {
				status: 200,
				headers: { "content-type": "text/markdown" },
			})) as unknown as typeof fetch;

		await expectRejectsWithStatus(
			service.installFromUrl({ scope: "project", cwd: root, url: "https://example.com/SKILL.md" }),
			409,
			/already exists/,
		);

		expect(await fs.readFile(existingSkillPath, "utf8")).toBe("original skill body");
	});
});

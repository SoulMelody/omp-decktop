import { afterEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { CcSwitchProvider } from "@omp-deck/protocol";

const provider: CcSwitchProvider = {
	id: "custom-openai",
	appType: "codex",
	name: "Custom OpenAI",
	isCurrent: true,
	category: null,
	providerType: null,
	websiteUrl: null,
	env: {},
	meta: { apiFormat: "openai_chat" },
	apiType: "openai-completions",
};

const readCcSwitchProviders = mock(() => [provider]);
const writeCcSwitchExtension = mock(async () => path.join(os.tmpdir(), "ccswitch-custom-openai"));
const refreshDeckExtensionProviders = mock(async () => undefined);
const broadcast = mock(() => undefined);

mock.module("./cc-switch-import.ts", () => ({
	readCcSwitchProviders,
	resolveCcSwitchDbPath: () => path.join(os.tmpdir(), "cc-switch.db"),
	writeCcSwitchExtension,
}));

mock.module("./auth-singleton.ts", () => ({
	refreshDeckExtensionProviders,
}));

mock.module("./broadcast-bus.ts", () => ({
	broadcastBus: { broadcast },
}));

afterEach(() => {
	readCcSwitchProviders.mockClear();
	writeCcSwitchExtension.mockClear();
	refreshDeckExtensionProviders.mockClear();
	broadcast.mockClear();
});

describe("POST /ccswitch/import (retired — see routes-model-providers/imports)", () => {
	test("returns 410 Gone with replacement routes", async () => {
		const { buildCcSwitchRouter } = await import("./routes-ccswitch.ts");
		const app = buildCcSwitchRouter({ cwd: "/tmp" });
		const res = await app.request("/import", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ providerKeys: ["custom-openai|codex"] }),
		});
		expect(res.status).toBe(410);
		const body = (await res.json()) as {
			error: string;
			status: number;
			replacement: { preview: string; commit: string };
		};
		expect(body.error).toBe("endpoint-retired");
		expect(body.status).toBe(410);
		expect(body.replacement.preview).toBe("POST /api/model-providers/imports/preview");
		expect(body.replacement.commit).toBe("POST /api/model-providers/imports/commit");
		expect(writeCcSwitchExtension).not.toHaveBeenCalled();
		expect(refreshDeckExtensionProviders).not.toHaveBeenCalled();
		expect(broadcast).not.toHaveBeenCalled();
	});
});

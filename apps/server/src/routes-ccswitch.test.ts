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

describe("POST /ccswitch/import", () => {
	test("refreshes extension providers before notifying clients", async () => {
		const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-deck-ccswitch-route-"));
		const dbPath = path.join(dbDir, "cc-switch.db");
		fs.writeFileSync(dbPath, "");
		try {
			const { buildCcSwitchRouter } = await import("./routes-ccswitch.ts");
			const app = buildCcSwitchRouter({ cwd: "C:/workspace" });

			const res = await app.request("/import", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ dbPath, providerKeys: ["custom-openai|codex"] }),
			});

			expect(res.status).toBe(200);
			expect(writeCcSwitchExtension).toHaveBeenCalledWith(provider);
			expect(refreshDeckExtensionProviders).toHaveBeenCalledWith("C:/workspace");
			expect(broadcast).toHaveBeenCalledWith({ type: "models_changed" });
			const refreshOrder = refreshDeckExtensionProviders.mock.invocationCallOrder[0];
			const broadcastOrder = broadcast.mock.invocationCallOrder[0];
			if (refreshOrder === undefined || broadcastOrder === undefined) {
				throw new Error("expected refresh and broadcast to be called");
			}
			expect(refreshOrder).toBeLessThan(broadcastOrder);
		} finally {
			fs.rmSync(dbDir, { recursive: true, force: true });
		}
	});
});

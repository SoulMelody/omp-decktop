import { describe, expect, test } from "bun:test";
import type {
	ModelProviderApi,
	ProbeProviderResponse,
	ProviderDiagnosticCheck,
	ProviderDiagnosticStatus,
} from "@omp-deck/protocol";

export function summariseProbe(
	response: ProbeProviderResponse,
): { passed: number; failed: number; skipped: number; unsupported: number } {
	const counts = { passed: 0, failed: 0, skipped: 0, unsupported: 0 };
	for (const check of response.checks ?? []) {
		switch (check.status) {
			case "pass":
				counts.passed += 1;
				break;
			case "fail":
				counts.failed += 1;
				break;
			case "skip":
				counts.skipped += 1;
				break;
			case "unsupported":
				counts.unsupported += 1;
				break;
		}
	}
	return counts;
}

export function pickInferenceAdapter(
	checks: ProviderDiagnosticCheck[],
): { adapter?: ModelProviderApi | "auto"; detail?: string } {
	const inference = checks.find((check) => check.id === "inference");
	if (!inference) return { detail: "inference check missing" };
	if (inference.status === "pass") return { adapter: inference.adapter, detail: inference.detail };
	return { detail: inference.detail };
}

const PROBE_OK: ProbeProviderResponse = {
	runAt: "2024-01-01T00:00:00Z",
	checks: [
		{ id: "endpoint", status: "pass", detail: "ok" },
		{ id: "authentication", status: "pass", detail: "ok" },
		{ id: "discovery", status: "pass", detail: "5 models" },
		{ id: "inference", status: "pass", detail: "ok", adapter: "openai-completions" },
	],
	attempts: [
		{ url: "https://example.test/v1/models", outcome: "success", status: 200 },
		{ url: "https://example.test/v1/chat/completions", outcome: "success", status: 200, latencyMs: 412 },
	],
};

describe("diagnostics summary helpers", () => {
	test("summarises pass/fail/skip/unsupported counts", () => {
		const counts = summariseProbe(PROBE_OK);
		expect(counts.passed).toBe(4);
		expect(counts.failed).toBe(0);
		expect(counts.skipped).toBe(0);
		expect(counts.unsupported).toBe(0);
	});

	test("sums a mixed probe response", () => {
		const mixed: ProbeProviderResponse = {
			runAt: "2024-01-02T00:00:00Z",
			checks: [
				{ id: "endpoint", status: "pass", detail: "ok" },
				{ id: "authentication", status: "fail", detail: "401" },
				{ id: "discovery", status: "skip", detail: "skipped" },
				{ id: "inference", status: "unsupported", detail: "no adapter" },
			],
			attempts: [],
		};
		const counts = summariseProbe(mixed);
		expect(counts.passed).toBe(1);
		expect(counts.failed).toBe(1);
		expect(counts.skipped).toBe(1);
		expect(counts.unsupported).toBe(1);
	});

	test("pickInferenceAdapter returns the adapter when inference passes", () => {
		const picked = pickInferenceAdapter(PROBE_OK.checks);
		expect(picked.adapter).toBe("openai-completions");
		expect(picked.detail).toBe("ok");
	});

	test("pickInferenceAdapter returns the reason when inference is skipped or failed", () => {
		const skipped: ProviderDiagnosticCheck = { id: "inference", status: "skip", detail: "disabled" };
		const failed: ProviderDiagnosticCheck = { id: "inference", status: "fail", detail: "no adapter" };
		expect(pickInferenceAdapter([skipped]).detail).toBe("disabled");
		expect(pickInferenceAdapter([failed]).detail).toBe("no adapter");
		expect(pickInferenceAdapter([]).detail).toBe("inference check missing");
	});

	test("inference gating only enables through the explicit toggle", () => {
		const status = (enabled: boolean, acknowledged: boolean): ProviderDiagnosticStatus => {
			if (!enabled) return "skip";
			if (!acknowledged) return "skip";
			return "pass";
		};
		expect(status(false, false)).toBe("skip");
		expect(status(true, false)).toBe("skip");
		expect(status(true, true)).toBe("pass");
	});
});

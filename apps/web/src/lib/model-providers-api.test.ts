import { afterEach, describe, expect, mock, test } from "bun:test";

import { ProviderApiError, modelProviderApi } from "./model-providers-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("model provider API response handling", () => {
	test("does not turn an aborted JSON body into a null success response", async () => {
		globalThis.fetch = mock(async () => ({
			ok: true,
			json: async () => {
				const error = new Error("request aborted");
				error.name = "AbortError";
				throw error;
			},
		})) as typeof fetch;

		try {
			await modelProviderApi.listProviders();
			throw new Error("expected listProviders to reject");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).name).toBe("AbortError");
		}
	});

	test("rejects an empty successful provider-list response", async () => {
		globalThis.fetch = mock(async () => new Response("", { status: 200 })) as typeof fetch;

		try {
			await modelProviderApi.listProviders();
			throw new Error("expected listProviders to reject");
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderApiError);
			expect((error as ProviderApiError).code).toBe("invalid-response");
		}
	});

	test("validates the delete response before the workspace reads providers", async () => {
		globalThis.fetch = mock(async () => new Response("", { status: 200 })) as typeof fetch;

		try {
			await modelProviderApi.deleteProvider("alpha", { revision: "test", confirm: true });
			throw new Error("expected deleteProvider to reject");
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderApiError);
			expect((error as ProviderApiError).code).toBe("invalid-response");
		}
	});
});

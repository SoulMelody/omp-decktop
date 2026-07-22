import { describe, expect, test } from "bun:test";

import { canDeleteModelProvider, validateCustomProvider } from "./ProviderWorkspace";

describe("models.yml provider deletion", () => {
	test("allows editable models-config providers", () => {
		expect(canDeleteModelProvider({ editable: true, layers: ["models-config"] })).toBe(true);
		expect(canDeleteModelProvider({ editable: true, layers: ["models-config", "oauth"] })).toBe(true);
	});

	test("does not offer deletion for runtime-only or read-only records", () => {
		expect(canDeleteModelProvider({ editable: true, layers: ["oauth"] })).toBe(false);
		expect(canDeleteModelProvider({ editable: false, layers: ["models-config", "extension"] })).toBe(false);
	});
});

describe("custom provider creation", () => {
	test("accepts a unique provider ID and HTTP(S) base URL", () => {
		expect(validateCustomProvider("my-provider", "https://api.example.com/v1", [])).toBeUndefined();
		expect(validateCustomProvider("local_1", "http://127.0.0.1:8080/v1", [])).toBeUndefined();
	});

	test("rejects empty, invalid, and duplicate provider IDs", () => {
		expect(validateCustomProvider("", "https://api.example.com", [])).toBe("id-required");
		expect(validateCustomProvider("Bad Provider", "https://api.example.com", [])).toBe("id-invalid");
		expect(validateCustomProvider("existing", "https://api.example.com", ["existing"])).toBe("id-exists");
	});

	test("requires a valid HTTP(S) base URL", () => {
		expect(validateCustomProvider("custom", "", [])).toBe("base-url-required");
		expect(validateCustomProvider("custom", "not-a-url", [])).toBe("base-url-invalid");
		expect(validateCustomProvider("custom", "file:///tmp/models", [])).toBe("base-url-invalid");
	});
});

import { isMap, parseDocument, type Document, type YAMLMap } from "yaml";

import { MODEL_PROVIDER_SECRET_SENTINEL } from "./model-provider-compat.ts";

export class ModelConfigDocumentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ModelConfigDocumentError";
	}
}

export function parseModelsDocument(source: string): Document {
	const document = parseDocument(source || "providers: {}\n", { keepSourceTokens: true, strict: true });
	if (document.errors.length > 0) {
		throw new ModelConfigDocumentError(`Invalid models.yml: ${document.errors[0]?.message}`);
	}
	if (document.contents !== null && !isMap(document.contents)) {
		throw new ModelConfigDocumentError("Invalid models.yml: top-level value must be an object");
	}
	return document;
}

export function getProvidersMap(document: Document): YAMLMap | undefined {
	if (!isMap(document.contents)) return undefined;
	const existing = document.contents.get("providers", true);
	return isMap(existing) ? existing : undefined;
}

export function redactProviderDefinition(value: unknown, inHeaders = false): unknown {
	if (Array.isArray(value)) return value.map((entry) => redactProviderDefinition(entry, false));
	if (!isPlainObject(value)) return value;
	const safe: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (key === "apiKey") continue;
		if (inHeaders) {
			safe[key] = MODEL_PROVIDER_SECRET_SENTINEL;
			continue;
		}
		safe[key] = redactProviderDefinition(child, key.toLowerCase() === "headers");
	}
	return safe;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
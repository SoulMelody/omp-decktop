import { ModelRegistry } from "@oh-my-pi/pi-coding-agent";
import { getEnvApiKey } from "@oh-my-pi/pi-ai";
import type { ModelInfo, SessionSummary } from "@omp-deck/protocol";

import { looksLikePlaceholderKey } from "../credential-quality.ts";

// `Model` is owned by `@oh-my-pi/pi-ai`, a transitive dep we don't bring in
// directly. Treat it as opaque at the bridge boundary — we only ever pass it
// back into the SDK's own methods.
export type SdkModel = {
	id: string;
	name?: string;
	provider: string | { toString(): string };
	contextWindow?: number;
	input?: unknown[];
};

/** Normalize a SessionManager.list / listAll record into our SessionSummary. */
export function summarize(raw: any): SessionSummary {
	// omp's list returns objects like:
	//   { id, path, cwd, title?, timestamp, messageCount?, modifiedAt? }
	const id = String(raw.id ?? raw.sessionId ?? raw.header?.id ?? "");
	const filePath = String(raw.path ?? raw.file ?? raw.sessionFile ?? "");
	const cwd = String(raw.cwd ?? raw.header?.cwd ?? "");
	const title =
		typeof raw.title === "string"
			? raw.title
			: typeof raw.header?.title === "string"
				? raw.header.title
				: undefined;
	const createdAt = String(raw.timestamp ?? raw.createdAt ?? raw.header?.timestamp ?? "");
	const updatedAt = String(raw.modifiedAt ?? raw.updatedAt ?? createdAt);
	const messageCount = Number(raw.messageCount ?? raw.count ?? 0);
	// Extract preview text from the first user message when the SDK provides it.
	// `raw.firstMessage` is populated by the SDK's `SessionManager.list()` and
	// gives us a meaningful preview instead of falling back to hash IDs.
	const preview =
		typeof raw.firstMessage === "string" && raw.firstMessage !== "(no messages)"
			? raw.firstMessage
			: undefined;
	return {
		id,
		path: filePath,
		cwd,
		title,
		preview,
		createdAt,
		updatedAt,
		messageCount,
	};
}

/**
 * Provider IDs that represent a true consumer subscription — the user
 * paid a monthly fee (Claude Pro/Max, ChatGPT Plus/Pro, Copilot, Cursor)
 * or a coding plan (Z.AI GLM, Alibaba, MiniMax, Kimi). The picker badges
 * these so users can tell subscription variants apart from API-key
 * variants of the same model name (the actual bug from issue #4).
 *
 * Intentionally an explicit allowlist, not `getOAuthProviders()` from the
 * SDK. The SDK's "OAuth providers" is a broader category that also
 * includes local runtimes (Ollama, LM Studio, vLLM), gateway services
 * (LiteLLM, Kilo, Cloudflare AI Gateway), and pure-API-tier providers
 * (Cerebras, Fireworks, Together, HuggingFace) — none of which are
 * "subscriptions" in the user-facing sense. Calling Ollama a
 * "subscription" in the model picker is actively misleading.
 *
 * Used for two purposes by `modelInfoFromSdk` and the issue-#4 hint:
 *   - Tag rows with `isSubscription: true` so the picker can badge them.
 *   - Pick recovery targets for the 401-fallback notification.
 *
 * When the SDK adds a new subscription-style provider, add it here.
 * False negatives (missing a real subscription) are graceful — the user
 * just doesn't get the badge. False positives (claiming Ollama is a
 * subscription) are confusing and that's what we're fixing here.
 */
export const SUBSCRIPTION_PROVIDER_IDS: ReadonlySet<string> = new Set([
	"anthropic", // Claude Pro/Max — competes with anthropic API key for Claude models
	"openai-codex", // ChatGPT Plus/Pro — competes with openai API key for gpt-5/etc.
	"github-copilot", // Copilot subscription
	"cursor", // Cursor IDE subscription — surfaces Claude/GPT models
	"perplexity", // Perplexity Pro/Max — competes with perplexity API key
	"alibaba-coding-plan", // Alibaba Coding Plan
	"zai", // Z.AI GLM Coding Plan
	"minimax-code", // MiniMax Coding Plan (International)
	"minimax-code-cn", // MiniMax Coding Plan (China)
	"kimi-code", // Kimi Code
	"google-antigravity", // Google Antigravity (preview)
]);
export function getSubscriptionProviders(): ReadonlySet<string> {
	return SUBSCRIPTION_PROVIDER_IDS;
}

/**
 * Heuristic match for "this error is an auth failure on the API call we
 * just made". Used to gate the issue-#4 subscription-fallback hint. Kept
 * narrow on purpose: false positives mean we suggest a switch when none is
 * needed, which is annoying; the worst case is silence on a less-common
 * error shape, which is the existing behavior.
 */
export function looksLikeAuthError(message: string): boolean {
	const m = message.toLowerCase();
	if (m.includes("401")) return true;
	if (m.includes("incorrect api key")) return true;
	if (m.includes("invalid api key")) return true;
	if (m.includes("invalid_api_key")) return true;
	if (m.includes("unauthorized")) return true;
	if (m.includes("authentication failed")) return true;
	if (m.includes("api key is required")) return true;
	return false;
}

/**
 * Coerce the SDK's model.name into a plain string. The SDK shape is
 * `string | undefined` in the type system, but some provider registries
 * return name as a `{ label, description }` object at runtime. This
 * helper normalizes both cases so the downstream label is always a
 * string — otherwise the object leaks to the frontend and React throws
 * "Objects are not valid as a React child".
 */
export function normalizeLabel(name: unknown): string | undefined {
	if (typeof name === "string") return name;
	if (name && typeof name === "object") {
		const obj = name as Record<string, unknown>;
		if (typeof obj.label === "string") return obj.label;
	}
	return undefined;
}

export function modelInfoFromSdk(
	model: SdkModel,
	registry: ModelRegistry,
	current: { provider: string; id: string } | undefined,
): ModelInfo {
	const provider = String(model.provider);
	const sdkModel = model as unknown as Parameters<ModelRegistry["hasConfiguredAuth"]>[0];
	const hasAuth = registry.hasConfiguredAuth(sdkModel);
	const usingOAuth = registry.isUsingOAuth(sdkModel);
	const isSubscription = getSubscriptionProviders().has(provider);
	// `isAvailable` semantics: would a call routed to this provider succeed?
	//   - SDK reports no configured auth at all → false (keyless paths are
	//     also flagged via hasConfiguredAuth, so this also covers them).
	//   - SDK has an OAuth credential in auth.db (`isUsingOAuth`) → true,
	//     regardless of what's in process.env.
	//   - Otherwise an env-var API key is the credential source. Validate
	//     that the value isn't a known placeholder (`sk-your-…here`, etc.)
	//     — see credential-quality.ts and issue #4.
	let isAvailable = hasAuth;
	if (isAvailable && !usingOAuth) {
		const envValue = getEnvApiKey(provider);
		// Only suppress when the env-var IS the credential. An empty env var
		// with `hasConfiguredAuth=true` means auth came from somewhere else
		// (auth.db non-OAuth entry, keyless provider, foundry, etc.) — trust
		// the SDK in that case.
		if (envValue && looksLikePlaceholderKey(envValue)) {
			isAvailable = false;
		}
	}
	const info: ModelInfo = {
		provider,
		id: model.id,
		label: normalizeLabel(model.name) || model.id,
		isAvailable,
	};
	if (isSubscription) info.isSubscription = true;
	if (typeof model.contextWindow === "number" && model.contextWindow > 0) {
		info.contextWindow = model.contextWindow;
	}
	if (Array.isArray(model.input) && model.input.length > 0) {
		info.inputModes = model.input.filter((m: unknown): m is "text" | "image" => m === "text" || m === "image");
	}
	if (current && current.provider === info.provider && current.id === info.id) {
		info.isCurrent = true;
	}
	return info;
}

/**
 * Extract the user-visible text from an SDK user-message `content` field.
 * Mirrors the shape variations the SDK emits: plain string, an array of
 * blocks like `{type:"text", text}`, or an object with a `.text` field.
 * Returns the empty string when nothing text-like is present (e.g.
 * image-only message).
 */
export function extractMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const block of content) {
			if (typeof block === "string") parts.push(block);
			else if (block && typeof block === "object") {
				const b = block as { type?: string; text?: unknown };
				if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
			}
		}
		return parts.join("");
	}
	if (content && typeof content === "object") {
		const c = content as { text?: unknown };
		if (typeof c.text === "string") return c.text;
	}
	return "";
}

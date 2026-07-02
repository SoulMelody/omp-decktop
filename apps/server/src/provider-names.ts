/**
 * Resolve human-readable display names for provider IDs.
 *
 * Built-in providers use a static map. cc-switch providers read the
 * display name from the cc-switch database (lazily, cached).
 */
import { readCcSwitchProviders, resolveCcSwitchDbPath } from "./cc-switch-import.ts";
import { logger } from "./log.ts";

const log = logger("provider-names");

// ─── Built-in provider display names ────────────────────────────────────────

const BUILTIN_NAMES: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	"openai-codex": "OpenAI Codex",
	google: "Google",
	ollama: "Ollama",
	"github-copilot": "GitHub Copilot",
	cursor: "Cursor",
	perplexity: "Perplexity",
	gemini: "Gemini",
	xai: "xAI",
	deepseek: "DeepSeek",
	zhipu: "Zhipu AI",
};

// ─── cc-switch provider names (lazily loaded) ───────────────────────────────

let _ccSwitchNames: Map<string, string> | undefined;

function loadCcSwitchNames(): Map<string, string> {
	if (_ccSwitchNames) return _ccSwitchNames;
	const map = new Map<string, string>();
	try {
		const dbPath = resolveCcSwitchDbPath();
		const providers = readCcSwitchProviders(dbPath);
		for (const p of providers) {
			const providerId = `ccswitch-${sanitize(p.id)}`;
			map.set(providerId, p.name);
		}
		log.info(`loaded ${map.size} cc-switch provider names`);
	} catch {
		// cc-switch DB not available — no display names to add.
	}
	_ccSwitchNames = map;
	return map;
}

function sanitize(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

/** Clear the cc-switch name cache so the next call re-reads the DB. */
export function clearCcSwitchNameCache(): void {
	_ccSwitchNames = undefined;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve a human-readable display name for a provider ID.
 * Returns undefined when no display name is known.
 */
export function resolveProviderName(providerId: string): string | undefined {
	// 1. Check built-in map.
	if (BUILTIN_NAMES[providerId]) return BUILTIN_NAMES[providerId];

	// 2. Check cc-switch providers.
	const ccNames = loadCcSwitchNames();
	if (ccNames.has(providerId)) return ccNames.get(providerId);

	return undefined;
}

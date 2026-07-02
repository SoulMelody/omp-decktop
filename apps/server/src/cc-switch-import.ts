/**
 * cc-switch DB import service.
 *
 * Reads provider configurations from the cc-switch SQLite database
 * (default: `~/.cc-switch/cc-switch.db`) and generates omp SDK
 * extension files at `~/.omp/agent/extensions/ccswitch-<name>/index.ts`
 * so the providers become available to all omp sessions.
 *
 * cc-switch stores each provider row with a composite key (id, app_type).
 * We de-duplicate by provider id — same provider registered for both
 * "claude" and "codex" only needs one extension.
 *
 * The generated extension uses `pi.registerProvider()` to add the provider
 * at session start. The extension is a plain TypeScript file the SDK loads
 * from `~/.omp/agent/extensions/<name>/index.ts`.
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { CcSwitchProvider } from "@omp-deck/protocol";
import { logger } from "./log.ts";

const log = logger("cc-switch-import");

// ─── cc-switch apiFormat → omp SDK api type mapping ─────────────────────────

const API_FORMAT_MAP: Record<string, string> = {
	openai_chat: "openai-completions",
	openai_responses: "openai-responses",
	anthropic: "anthropic-messages",
	gemini: "google-genai",
};

/**
 * Resolve the default cc-switch database path.
 * - Env override: `CC_SWITCH_DB_PATH`
 * - Default: `~/.cc-switch/cc-switch.db`
 */
export function resolveCcSwitchDbPath(): string {
	const override = process.env.CC_SWITCH_DB_PATH?.trim();
	if (override) return override;
	return path.join(os.homedir(), ".cc-switch", "cc-switch.db");
}

/**
 * Map cc-switch `meta.apiFormat` to the omp SDK's provider api type string.
 */
function mapApiFormat(apiFormat: unknown): string | null {
	if (typeof apiFormat !== "string") return null;
	return API_FORMAT_MAP[apiFormat] ?? null;
}

/**
 * Parse a cc-switch settings_config JSON string. Returns the parsed object
 * or an empty object on failure. The `env` sub-key holds the actual
 * environment variables (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, etc.);
 * `auth` holds literal API keys; `config` is an INI string with `base_url`
 * and other model-provider settings.
 */
function parseSettingsConfig(raw: string | null): {
	env: Record<string, string>;
	auth?: Record<string, string>;
	config?: string;
	[k: string]: unknown;
} {
	if (!raw) return { env: {} };
	try {
		const parsed = JSON.parse(raw);
		const env =
			parsed && typeof parsed === "object" && parsed.env && typeof parsed.env === "object"
				? (parsed.env as Record<string, string>)
				: {};
		return { ...parsed, env };
	} catch {
		return { env: {} };
	}
}

function parseMeta(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/**
 * Read all providers from the cc-switch database. De-duplicates by
 * provider id (same provider for claude + codex → one entry), preferring
 * the row with `is_current = 1`.
 */
export function readCcSwitchProviders(dbPath: string): CcSwitchProvider[] {
	if (!existsSync(dbPath)) {
		throw new Error(`cc-switch database not found at: ${dbPath}`);
	}

	const db = new Database(dbPath, { readonly: true });
	try {
		const rows = db
			.query(
				`SELECT id, app_type, name, settings_config, website_url,
                    category, is_current, provider_type, meta
         FROM providers
         ORDER BY sort_index, name`,
			)
			.all() as Array<{
			id: string;
			app_type: string;
			name: string;
			settings_config: string | null;
			website_url: string | null;
			category: string | null;
			is_current: number | null;
			provider_type: string | null;
			meta: string | null;
		}>;

		// De-duplicate by provider id. Prefer is_current=1 rows.
		const byId = new Map<string, CcSwitchProvider>();
		for (const row of rows) {
			const settings = parseSettingsConfig(row.settings_config);
			const meta = parseMeta(row.meta);
			const apiType = mapApiFormat(meta.apiFormat);

			const provider: CcSwitchProvider = {
				id: row.id,
				appType: row.app_type,
				name: row.name,
				isCurrent: row.is_current === 1,
				category: row.category,
				providerType: row.provider_type,
				websiteUrl: row.website_url,
				env: settings.env,
				auth: settings.auth,
				configIni: settings.config,
				meta,
				apiType,
			};

			const existing = byId.get(row.id);
			if (!existing) {
				byId.set(row.id, provider);
			} else if (provider.isCurrent && !existing.isCurrent) {
				// Prefer the row marked as current.
				byId.set(row.id, provider);
			}
		}

		return Array.from(byId.values());
	} finally {
		db.close();
	}
}

// ─── Extension generation ────────────────────────────────────────────────────

/**
 * Sanitize a provider name/id into a valid directory name component.
 * Lowercase, replace non-alphanumeric with dashes, collapse runs.
 */
function sanitizeDirName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

/**
 * Extract the base URL from cc-switch settings. cc-switch stores this in
 * two places depending on provider type:
 *   1. `settings_config.env.ANTHROPIC_BASE_URL` (or similar env keys)
 *   2. `settings_config.config` — an INI string with `base_url = "http://..."`
 * Returns undefined when neither source has a value.
 */
function extractBaseUrl(
	env: Record<string, string>,
	configIni: string | undefined,
): string | undefined {
	// 1. Check env keys first (some providers use this).
	const fromEnv = env.ANTHROPIC_BASE_URL || env.OPENAI_BASE_URL || env.BASE_URL;
	if (fromEnv) return fromEnv;
	// 2. Parse the INI config string for `base_url = "..."`.
	if (configIni) {
		const match = configIni.match(/^\s*base_url\s*=\s*"([^"]*)"/m);
		if (match) return match[1] || undefined;
	}
	return undefined;
}

function extractApiKey(
	env: Record<string, string>,
	auth: Record<string, string> | undefined,
): string | undefined {
	// 1. Check env keys first.
	const fromEnv =
		env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.API_KEY;
	if (fromEnv) return fromEnv;
	// 2. Check auth sub-object (cc-switch stores literal keys here, e.g.
	//    `auth.OPENAI_API_KEY`).
	if (auth) {
		const fromAuth =
			auth.ANTHROPIC_AUTH_TOKEN || auth.ANTHROPIC_API_KEY || auth.OPENAI_API_KEY || auth.API_KEY;
		if (fromAuth) return fromAuth;
	}
	return undefined;
}

function extractModel(
	env: Record<string, string>,
	meta: Record<string, unknown>,
	configIni: string | undefined,
): string | undefined {
	// 1. Check env keys first.
	const envModel =
		env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.OPENAI_MODEL || env.MODEL;
	if (envModel) return stripAnnotations(envModel);
	// 2. Check meta.model.
	if (typeof meta.model === "string") return stripAnnotations(meta.model);
	// 3. Parse the INI config string for `model = "..."`.
	if (configIni) {
		const match = configIni.match(/^\s*model\s*=\s*"([^"]*)"/m);
		if (match?.[1]) return stripAnnotations(match[1]);
	}
	return undefined;
}

/** Strip cc-switch display annotations like "[1m]" or "[128k]". */
function stripAnnotations(raw: string): string | undefined {
	const cleaned = raw.replace(/\[.*?\]$/, "").trim();
	return cleaned.length > 0 ? cleaned : undefined;
}

// ─── Dynamic model fetching (one-shot at import time) ──────────────────────

type FetchedModel = { id: string; name: string };

/**
 * Fetch the live model list from an OpenAI-compatible /v1/models endpoint.
 * Called once during import so the extension file contains a static model list
 * – no runtime fetch, no delay on session start.
 */
async function fetchModelsFromEndpoint(
	baseUrl: string,
	apiKey: string | undefined,
): Promise<FetchedModel[]> {
	const cleanBase = baseUrl.replace(/\/+$/, "");
	const headers: Record<string, string> = {};
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

	let response: Response;
	try {
		response = await fetch(`${cleanBase}/models`, { headers });
	} catch {
		return [];
	}
	if (!response.ok) return [];

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return [];
	}

	const items: unknown[] = Array.isArray(payload)
		? (payload as unknown[])
		: Array.isArray((payload as Record<string, unknown>)?.data)
			? ((payload as Record<string, unknown>).data as unknown[])
			: Array.isArray((payload as Record<string, unknown>)?.models)
				? ((payload as Record<string, unknown>).models as unknown[])
				: [];

	const result: FetchedModel[] = [];
	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const obj = item as Record<string, unknown>;
		const id = obj.id ?? obj.name ?? obj.model;
		if (typeof id !== "string" || id.length === 0) continue;
		result.push({ id, name: id as string });
	}
	return result;
}

// ─── Extension source generation ───────────────────────────────────────────

/**
 * Generate the content of an omp SDK extension `index.ts` file that
 * registers a single custom provider via `pi.registerProvider()`.
 *
 * The extension is loaded by the SDK from
 * `~/.omp/agent/extensions/ccswitch-<name>/index.ts`.
 *
 * `pi.registerProvider(name, config)` is the correct SDK API:
 * - `name`: provider id string
 * - `config.baseUrl`: API endpoint
 * - `config.apiKey`: literal key or env-var name the SDK resolves
 * - `config.api`: built-in api type (e.g. "openai-completions")
 * - `config.authHeader: true`: emit `Authorization: Bearer` header when needed
 * - `config.models`: static model list (pre-fetched at import time for
 *    OpenAI-compatible providers, single-entry for others)
 */
export function generateExtensionSource(opts: {
	providerId: string;
	displayName: string;
	apiType: string;
	baseUrl?: string;
	apiKey?: string;
	model?: string;
	/** Pre-fetched model list for OpenAI-compatible providers. */
	models?: FetchedModel[];
}): string {
	const { providerId, displayName, apiType, baseUrl, apiKey, model, models } = opts;
	const esc = (s: string | undefined) => (s ? JSON.stringify(s) : "undefined");
	const fnName = sanitizeDirName(providerId).replace(/-/g, "_").replace(/^ccswitch_/, "");

	const modelEntries =
		models && models.length > 0
			? models
					.map(
						(m) => `        {
          id: ${esc(m.id)},
          name: ${esc(m.name)},
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
        }`,
					)
					.join(",\n")
			: `        {
          id: ${esc(model ?? "default")},
          name: ${esc(model ?? "default")},
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
        }`;

	return `/**
 * cc-switch imported provider: ${displayName}
 * Auto-generated by omp-deck cc-switch import.
 * Provider id: ${providerId}
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function ccswitch_${fnName}(pi: ExtensionAPI): void {
  pi.registerProvider(${esc(providerId)}, {
    baseUrl: ${esc(baseUrl)},
    apiKey: ${esc(apiKey)},
    api: ${esc(apiType)},
    authHeader: true,
    models: [
${modelEntries}
    ],
  });
}
`;
}

/**
 * Write an extension directory for a cc-switch provider.
 * For OpenAI-compatible providers, fetches the live model list once
 * before writing the extension so the generated file contains a static
 * model list — no runtime fetch on session start.
 * Returns the absolute path of the created extension directory.
 */
export async function writeCcSwitchExtension(provider: CcSwitchProvider): Promise<string> {
	const extensionsRoot = path.join(os.homedir(), ".omp", "agent", "extensions");
	const dirName = `ccswitch-${sanitizeDirName(provider.id)}`;
	const extDir = path.join(extensionsRoot, dirName);

	mkdirSync(extDir, { recursive: true });

	const providerId = `ccswitch-${sanitizeDirName(provider.id)}`;
	const apiType = provider.apiType ?? "openai-completions";
	const baseUrl = extractBaseUrl(provider.env, provider.configIni);
	const apiKey = extractApiKey(provider.env, provider.auth);
	const model = extractModel(provider.env, provider.meta, provider.configIni);

	// Pre-fetch model list for OpenAI-compatible providers.
	let models: FetchedModel[] | undefined;
	if ((apiType === "openai-completions" || apiType === "openai-responses") && baseUrl) {
		models = await fetchModelsFromEndpoint(baseUrl, apiKey);
		if (models.length === 0) {
			log.warn(`no models returned from ${baseUrl}/models for ${provider.name}`);
		} else {
			log.info(`fetched ${models.length} models from ${baseUrl}/models for ${provider.name}`);
		}
	}

	const source = generateExtensionSource({
		providerId,
		displayName: provider.name,
		apiType,
		baseUrl,
		apiKey,
		model,
		models,
	});

	const indexPath = path.join(extDir, "index.ts");
	writeFileSync(indexPath, source, "utf-8");

	log.info(`wrote cc-switch extension: ${extDir}`);
	return extDir;
}

/**
 * Skill-level enumeration across every omp provider.
 *
 * Built on top of the SDK's capability system: `loadCapability(skillCapability.id, { cwd })`
 * returns the union of skills from every registered provider (`native`,
 * `claude-plugins`, `claude`, `codex`, `opencode`, ...) each tagged with
 * `_source.provider`, `_source.providerName`, and `level`.
 *
 * The marketplace-only T-27 implementation has been replaced. The deck stays
 * omp-native: it shows what omp loads, with `native` (the user's own
 * `~/.omp/agent/skills/`) sorted first. Marketplace plugins are one source
 * among many.
 *
 * Watcher fan-out (broadcasting `skills_changed`) lives in `skills-watcher.ts`
 * next to the other server-level wiring.
 */

import { mkdir, readdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { loadCapability } from "@oh-my-pi/pi-coding-agent/capability";
import { skillCapability, type Skill as SdkSkill } from "@oh-my-pi/pi-coding-agent/capability/skill";

import type {
	ListSkillsResponse,
	SkillDetailResponse,
	SkillFile,
	SkillFrontmatter,
	SkillProvider,
	SkillSummary,
	CreateSkillRequest,
	CreateSkillResponse,
	UpdateSkillRequest,
	UpdateSkillResponse,
	InstallSkillFromUrlRequest,
	InstallSkillFromUrlResponse,
	DeleteSkillResponse,
} from "@omp-deck/protocol";

import type { Config } from "./config.ts";
import { logger } from "./log.ts";
import type { MarketplaceService } from "./marketplace-service.ts";
import { isCwdAllowed } from "./fs-allow.ts";

const log = logger("skills");

/**
 * Display labels for known providers. Falls through to `providerName` from the
 * SDK's source metadata for anything we haven't styled — that ensures new
 * providers show up coherently without a deck release.
 */
const PROVIDER_LABEL: Readonly<Record<string, string>> = {
	native: "OMP",
	"claude-plugins": "Claude Plugins",
	claude: "Claude Code",
	codex: "Codex",
	opencode: "OpenCode",
	cursor: "Cursor",
	windsurf: "Windsurf",
	cline: "Cline",
	gemini: "Gemini",
	agents: "Subagents",
	custom: "Custom",
};

/**
 * Provider priority for default sort. Lower wins. Unknown providers land at
 * the end (parity with arbitrary string compare).
 */
const PROVIDER_PRIORITY: Readonly<Record<string, number>> = {
	native: 0,
	"claude-plugins": 1,
	claude: 2,
	codex: 3,
	opencode: 4,
	cursor: 5,
	windsurf: 6,
	cline: 7,
	gemini: 8,
	agents: 9,
	custom: 10,
};

const MAX_INSTALL_BYTES = 256 * 1024;
const SKILL_MARKER = "SKILL.md";

class UserFacingError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "UserFacingError";
	}
}

export class SkillsService {
	constructor(
		private readonly config: Config,
		private readonly marketplace: MarketplaceService,
	) {}

	async listSkills(cwd?: string): Promise<ListSkillsResponse> {
		const resolvedCwd = cwd?.trim() || this.config.defaultCwd;
		const pluginIndex = await this.buildPluginIndex();

		const result = await loadCapability<SdkSkill>(skillCapability.id, { cwd: resolvedCwd });

		const skills: SkillSummary[] = [];
		for (const item of result.items) {
			const summary = this.toSummary(item, pluginIndex);
			if (summary) skills.push(summary);
		}

		// Stable order: provider priority, then by displayed name, then dirName
		// as a final tiebreaker. The UI can re-sort, but native-first is the
		// default the omp-deck cockpit lives by.
		skills.sort((a, b) => {
			const pa = PROVIDER_PRIORITY[a.provider] ?? 100;
			const pb = PROVIDER_PRIORITY[b.provider] ?? 100;
			if (pa !== pb) return pa - pb;
			const n = a.name.localeCompare(b.name);
			if (n !== 0) return n;
			return a.dirName.localeCompare(b.dirName);
		});

		if (result.warnings.length > 0) {
			log.debug(`loadCapability warnings`, result.warnings);
		}

		return { skills };
	}

	async getSkillDetail(id: string, cwd?: string): Promise<SkillDetailResponse | undefined> {
		const skillPath = decodeIdToPath(id);
		if (!skillPath) return undefined;

		// Always re-run the capability load so we authoritatively prove this
		// path was discoverable. Refusing to read arbitrary disk paths is the
		// security gate — if `loadCapability` didn't surface it, we don't
		// serve it.
		const list = await this.listSkills(cwd);
		const summary = list.skills.find((s) => s.skillPath === skillPath);
		if (!summary) return undefined;

		let raw: string;
		try {
			raw = await readFile(skillPath, "utf8");
		} catch {
			return undefined;
		}

		const body = stripFrontmatter(raw);
		const skillDir = path.dirname(skillPath);
		const files = await walkSkillFiles(skillDir);

		return { ...summary, body, rawContent: raw, files };
	}

	/**
	 * Build a `{ installPath -> { id, name, marketplace } }` index so skills
	 * whose source path lives under a marketplace install can be attributed
	 * to their owning plugin. Reads through `MarketplaceService.listInstalled`
	 * so it's one disk hit, not one per skill.
	 */
	private async buildPluginIndex(): Promise<PluginIndex> {
		const installed = await this.marketplace.listInstalled();
		const byPath = new Map<string, { id: string; name: string; marketplace: string }>();
		for (const p of installed) {
			byPath.set(normalize(p.installPath), {
				id: p.id,
				name: p.name,
				marketplace: p.marketplace,
			});
		}
		return byPath;
	}

	private toSummary(item: SdkSkill, pluginIndex: PluginIndex): SkillSummary | undefined {
		const skillPath = item.path;
		if (!skillPath) return undefined;

		const provider = (item._source?.provider ?? "custom") as SkillProvider;
		const providerName = item._source?.providerName ?? PROVIDER_LABEL[provider] ?? provider;
		const providerLabel = PROVIDER_LABEL[provider] ?? providerName;

		const dirName = path.basename(path.dirname(skillPath));
		const frontmatter = normalizeFrontmatter(item.frontmatter, item.name, dirName);

		const summary: SkillSummary = {
			id: encodePathToId(skillPath),
			name: frontmatter.name,
			dirName,
			provider,
			providerLabel,
			level: item.level,
			skillPath,
			frontmatter,
			enabled: !(item.frontmatter?.hide === true),
		};

		if (provider === "claude-plugins") {
			const owner = findPluginOwner(skillPath, pluginIndex);
			if (owner) {
				summary.pluginId = owner.id;
				summary.pluginName = owner.name;
				summary.marketplace = owner.marketplace;
			}
		}

		return summary;
	}

	// ─── skill mutations ─────────────────────────────────────────────────────

	/** 
	 * Resolve the target directory for a native skill write.
	 * `scope` chooses between user (~/.omp/agent/skills/) and project (<cwd>/.omp/skills/).
	 */
	private resolveSkillRoot(scope: "user" | "project", cwd?: string): string {
		if (scope === "project") {
			const resolvedCwd = path.resolve(cwd?.trim() || this.config.defaultCwd);
			if (!isCwdAllowed(resolvedCwd, [this.config.defaultCwd, ...this.config.extraWorkspaces])) {
				throw new Error("project cwd is not under an allowed root");
			}
			return path.join(resolvedCwd, ".omp", "skills");
		}
		return path.join(os.homedir(), ".omp", "agent", "skills");
	}

	/** Deny writes into external tool directories. Only omp-native roots allowed. */
	private isWriteAllowed(skillPath: string, scope: "user" | "project", cwd?: string): boolean {
		const allowedRoot = path.resolve(this.resolveSkillRoot(scope, cwd));
		const resolvedSkillPath = path.resolve(skillPath);
		const rel = path.relative(allowedRoot, resolvedSkillPath);
		return !rel.startsWith("..") && !path.isAbsolute(rel);
	}

	async createSkill(req: CreateSkillRequest): Promise<CreateSkillResponse> {
		const scope = req.scope ?? "user";
		const root = this.resolveSkillRoot(scope, req.cwd);
		// Sanitize dirName: only alphanumeric, hyphen, underscore
		const sanitized = req.dirName.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
		if (!sanitized) throw new Error("invalid dirName: no valid characters after sanitization");
		const skillDir = path.join(root, sanitized);
		await mkdir(skillDir, { recursive: true });
		const skillPath = path.join(skillDir, "SKILL.md");
		await writeFile(skillPath, req.body, "utf8");
		log.info(`created skill at ${skillPath}`);
		return { id: encodePathToId(skillPath), skillPath };
	}

	async updateSkill(id: string, req: UpdateSkillRequest): Promise<UpdateSkillResponse> {
		const skillPath = decodeIdToPath(id);
		if (!skillPath) throw new Error("invalid skill id");
		// Verify discoverable
		const list = await this.listSkills(req.cwd);
		const summary = list.skills.find((s) => s.skillPath === skillPath);
		if (!summary) throw new Error("skill not found in provider discovery");
		// Only native provider is editable
		if (summary.provider !== "native") {
			throw new Error(`provider "${summary.provider}" is read-only; fork to native first`);
		}
		if (!this.isWriteAllowed(skillPath, summary.level as "user" | "project", req.cwd)) {
			throw new Error("write refused: target is outside omp-native skill root");
		}
		await writeFile(skillPath, req.body, "utf8");
		log.info(`updated skill at ${skillPath}`);
		return { id, skillPath };
	}

	async deleteSkill(id: string, cwd?: string): Promise<DeleteSkillResponse> {
		const skillPath = decodeIdToPath(id);
		if (!skillPath) throw new Error("invalid skill id");
		const list = await this.listSkills(cwd);
		const summary = list.skills.find((s) => s.skillPath === skillPath);
		if (!summary) throw new Error("skill not found in provider discovery");
		if (summary.provider !== "native") {
			throw new Error(`provider "${summary.provider}" is read-only; cannot delete`);
		}
		if (!this.isWriteAllowed(skillPath, summary.level as "user" | "project", cwd)) {
			throw new Error("write refused: target is outside omp-native skill root");
		}
		const dirName = summary.dirName;
		const skillDir = path.dirname(skillPath);
		await rm(skillDir, { recursive: true, force: true });
		log.info(`deleted skill at ${skillDir}`);
		return { id, skillPath, dirName };
	}

	async installFromUrl(req: InstallSkillFromUrlRequest): Promise<InstallSkillFromUrlResponse> {
		const scope = req.scope ?? "user";
		if (scope !== "user" && scope !== "project") {
			throw new UserFacingError("scope must be \"user\" or \"project\"", 400);
		}

		const root = this.resolveSkillRoot(scope, req.cwd);
		const source = req.url.trim();
		if (!source) throw new UserFacingError("url is required", 400);

		const sourceUrl = resolveSkillSourceUrl(source);
		const body = await fetchSkillMarkdown(sourceUrl);
		validateSkillMarkdown(body);

		const dirName = deriveInstalledSkillDirName(body, sourceUrl);
		const skillDir = path.join(root, dirName);
		const skillPath = path.join(skillDir, SKILL_MARKER);
		try {
			await stat(skillPath);
			throw new UserFacingError(`skill "${dirName}" already exists`, 409);
		} catch (err) {
			if (err instanceof UserFacingError) throw err;
			if (!isNotFoundError(err)) throw err;
		}

		await mkdir(skillDir, { recursive: true });
		await writeFile(skillPath, body, "utf8");
		log.info(`installed skill from URL at ${skillPath}`);
		return { id: encodePathToId(skillPath), skillPath, dirName };
	}
}

/**
 * Accept a GitHub blob URL, a GitHub raw URL, or any raw SKILL.md URL
 * and normalise it to the URL we'll actually fetch. We refuse anything that
 * isn't http(s) — file:, data:, git://, etc. are out.
 */
function resolveSkillSourceUrl(source: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(source);
	} catch {
		throw new UserFacingError("url is not a valid URL", 400);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new UserFacingError("url must use http or https", 400);
	}
	// GitHub: https://github.com/<owner>/<repo>/blob/<ref>/<path…>  →  raw.
	// Strip query/fragment — github.com doesn't accept them on raw URLs and
	// they often carry tokens we don't want logged.
	if (parsed.hostname === "github.com" && parsed.pathname.includes("/blob/")) {
		const parts = parsed.pathname.split("/").filter(Boolean);
		const blobIdx = parts.indexOf("blob");
		if (blobIdx > 0 && blobIdx + 1 < parts.length) {
			const ref = parts[blobIdx + 1];
			const filePath = parts.slice(blobIdx + 2).join("/");
			if (filePath) {
				return new URL(`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${ref}/${filePath}`);
			}
		}
	}
	if (parsed.hostname === "raw.githubusercontent.com" || parsed.hostname === "gist.githubusercontent.com") {
		// Drop any ?token=… style query that might leak a credential.
		parsed.search = "";
		parsed.hash = "";
	}
	return parsed;
}

/**
 * Fetch the SKILL.md body, refusing anything that isn't text-like, anything
 * that would exceed MAX_INSTALL_BYTES, and anything that returns non-OK.
 */
async function fetchSkillMarkdown(url: URL): Promise<string> {
	const res = await fetch(url, { redirect: "follow" });
	if (!res.ok) {
		throw new UserFacingError(`fetch failed: HTTP ${res.status}`, 502);
	}
	const lenHeader = res.headers.get("content-length");
	if (lenHeader) {
		const declared = Number.parseInt(lenHeader, 10);
		if (Number.isFinite(declared) && declared > MAX_INSTALL_BYTES) {
			throw new UserFacingError(`response too large (${declared} bytes)`, 413);
		}
	}
	const ctype = res.headers.get("content-type") ?? "";
	if (
		ctype &&
		!ctype.toLowerCase().includes("text") &&
		!ctype.toLowerCase().includes("markdown") &&
		!ctype.toLowerCase().includes("octet-stream")
	) {
		throw new UserFacingError(`unsupported content-type: ${ctype}`, 415);
	}
	// Read with a hard byte cap so a hostile server streaming gigabytes
	// can't OOM us before the content-length header is sent.
	const reader = res.body?.getReader();
	if (!reader) throw new UserFacingError("empty response body", 502);
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > MAX_INSTALL_BYTES) {
			try {
				await reader.cancel();
			} catch {
				/* ignore */
			}
			throw new UserFacingError(`response too large (>${MAX_INSTALL_BYTES} bytes)`, 413);
		}
		chunks.push(value);
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		merged.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/**
 * Require that the body at least looks like a SKILL.md file. We don't fully
 * parse frontmatter here — deriveInstalledSkillDirName does the cheap parse
 * for the name — but we reject the obviously-wrong cases (empty, binary, or
 * an HTML error page pretending to be a skill).
 */
function validateSkillMarkdown(body: string): void {
	if (!body || !body.trim()) throw new UserFacingError("response body is empty", 400);
	if (body.length > MAX_INSTALL_BYTES) throw new UserFacingError("response body exceeds size limit", 413);
	const head = body.slice(0, 512).toLowerCase();
	if (head.includes("<!doctype html") || head.includes("<html")) {
		throw new UserFacingError("response is HTML, not a SKILL.md", 400);
	}
}

/**
 * Pull a safe directory name out of the body. Priority:
 *   1. The frontmatter `name:` field, if it parses and slugifies cleanly.
 *   2. The URL's last meaningful path segment.
 *   3. A timestamped fallback.
 * Always returns a relative, slug-only segment — no separators, no
 * traversal, no reserved names.
 */
function deriveInstalledSkillDirName(body: string, sourceUrl: URL): string {
	const frontName = parseFrontmatterName(body);
	const fromFrontmatter = frontName ? slugify(frontName) : "";
	const fromPath = slugify(decodeURIComponent(path.basename(sourceUrl.pathname, path.extname(sourceUrl.pathname))) || "skill");
	let candidate = fromFrontmatter || fromPath;
	if (!candidate || RESERVED_DIR_NAMES.has(candidate)) {
		candidate = `skill-${Date.now().toString(36)}`;
	}
	// Belt and braces: never let a slug start with a dot, never let it
	// contain a separator that `path.join` would interpret.
	candidate = candidate.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^[-.]+|[-.]+$/g, "");
	if (!candidate) candidate = `skill-${Date.now().toString(36)}`;
	return candidate.slice(0, 64);
}

function parseFrontmatterName(body: string): string | undefined {
	if (!body.startsWith("---")) return undefined;
	const end = body.indexOf("\n---", 3);
	if (end < 0) return undefined;
	const block = body.slice(3, end);
	for (const line of block.split(/\r?\n/)) {
		const m = /^name\s*:\s*(.+?)\s*$/.exec(line);
		if (m) {
			// Strip wrapping quotes if present.
			const raw = (m[1] ?? "").replace(/^['"]|['"]$/g, "").trim();
			return raw || undefined;
		}
	}
	return undefined;
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

const RESERVED_DIR_NAMES = new Set([".", ".."]);

function isNotFoundError(err: unknown): boolean {
	if (!err || typeof err !== "object" || !("code" in err)) return false;
	return err.code === "ENOENT";
}

type PluginIndex = Map<string, { id: string; name: string; marketplace: string }>;

function normalize(p: string): string {
	// Windows paths arrive with backslashes from the SDK; canonicalize to
	// forward slashes plus lowercase drive letter so the prefix-match below
	// works regardless of how the path was constructed.
	return p.replace(/\\/g, "/").replace(/^([a-z]):/i, (_, d: string) => `${d.toLowerCase()}:`);
}

function findPluginOwner(
	skillPath: string,
	pluginIndex: PluginIndex,
): { id: string; name: string; marketplace: string } | undefined {
	const candidate = normalize(skillPath);
	for (const [installPath, owner] of pluginIndex) {
		// Path-prefix attribution. `installPath` ends at the plugin root; any
		// skill under it (`<installPath>/skills/<name>/SKILL.md`) belongs to
		// that plugin. Trailing-slash insensitive.
		const prefix = installPath.endsWith("/") ? installPath : `${installPath}/`;
		if (candidate.startsWith(prefix)) return owner;
	}
	return undefined;
}

function normalizeFrontmatter(
	raw: Record<string, unknown> | undefined,
	skillName: string,
	dirName: string,
): SkillFrontmatter {
	const out: SkillFrontmatter = {
		name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : skillName || dirName,
	};
	const description = raw?.description;
	if (typeof description === "string" && description.trim()) out.description = description.trim();
	const model = raw?.model;
	if (typeof model === "string" && model.trim()) out.model = model.trim();
	const triggers = raw?.triggers;
	if (Array.isArray(triggers)) {
		const cleaned = triggers.filter((t): t is string => typeof t === "string" && t.length > 0);
		if (cleaned.length > 0) out.triggers = cleaned;
	}
	const tags = raw?.tags;
	if (Array.isArray(tags)) {
		const cleaned = tags.filter((t): t is string => typeof t === "string" && t.length > 0);
		if (cleaned.length > 0) out.tags = cleaned;
	}
	return out;
}

/** Encode an absolute path into a URL-safe id. Reversible via decodeIdToPath. */
function encodePathToId(p: string): string {
	const bytes = Buffer.from(p, "utf8");
	return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeIdToPath(id: string): string | undefined {
	try {
		const b64 = id.replace(/-/g, "+").replace(/_/g, "/");
		const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
		return Buffer.from(b64 + pad, "base64").toString("utf8");
	} catch {
		return undefined;
	}
}

/**
 * Strip a leading `---\n…\n---\n?` frontmatter block from a SKILL.md body.
 * Mirrors the SDK's loader so the two never disagree about where the body
 * starts.
 */
function stripFrontmatter(text: string): string {
	if (!text.startsWith("---")) return text;
	const end = text.indexOf("\n---", 3);
	if (end < 0) return text;
	let cursor = end + 4;
	if (text[cursor] === "\r") cursor += 1;
	if (text[cursor] === "\n") cursor += 1;
	return text.slice(cursor);
}

// Cap depth and total entries so a misconfigured plugin (e.g. checked-in
// node_modules) can't blow up the response. Skill trees are typically a
// handful of files; 500 entries is generous and bounds the wire size.
const SKILL_WALK_MAX_ENTRIES = 500;
const SKILL_WALK_MAX_DEPTH = 6;
const SKILL_WALK_EXCLUDE = new Set([
	"node_modules",
	"__pycache__",
	".git",
	".venv",
	"venv",
	"dist",
	"build",
]);

async function walkSkillFiles(skillDir: string): Promise<SkillFile[]> {
	const out: SkillFile[] = [];

	async function recurse(absDir: string, relParent: string, depth: number): Promise<void> {
		if (out.length >= SKILL_WALK_MAX_ENTRIES) return;
		if (depth > SKILL_WALK_MAX_DEPTH) return;
		let entries;
		try {
			entries = await readdir(absDir, { withFileTypes: true });
		} catch (err) {
			log.warn(`walk: readdir failed at ${absDir}`, err);
			return;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (out.length >= SKILL_WALK_MAX_ENTRIES) return;
			if (SKILL_WALK_EXCLUDE.has(entry.name)) continue;
			if (entry.isSymbolicLink()) continue;
			const relPath = relParent ? `${relParent}/${entry.name}` : entry.name;
			const absPath = path.join(absDir, entry.name);

			if (entry.isDirectory()) {
				out.push({ relPath, name: entry.name, kind: "dir" });
				await recurse(absPath, relPath, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			if (depth === 0 && entry.name === "SKILL.md") continue;
			let st;
			try {
				st = await stat(absPath);
			} catch (err) {
				log.warn(`walk: stat failed at ${absPath}`, err);
				continue;
			}
			out.push({
				relPath,
				name: entry.name,
				kind: "file",
				size: st.size,
				mtime: st.mtime.toISOString(),
			});
		}
	}

	await recurse(skillDir, "", 0);
	return out;
}

export type { SkillSummary, SkillFrontmatter, SkillDetailResponse, SkillFile, ListSkillsResponse };

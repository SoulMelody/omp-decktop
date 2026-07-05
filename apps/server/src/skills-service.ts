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

import { mkdir, readdir, readFile, stat, writeFile, rm, symlink } from "node:fs/promises";
import { exec as execAsync } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execAsync);
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
	InstallSkillFromNpmRequest,
	InstallSkillFromNpmResponse,
	RemoveSkillFromNpmRequest,
	RemoveSkillFromNpmResponse,
	ListNpmSkillsRequest,
	ListNpmSkillsResponse,
	NpmSkillEntry,
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
		// Delegate to bunx skills add - it handles URLs, GitHub shorthand, git URLs, etc.
		const npmResult = await this.installFromNpm({
			source: { source: req.url.trim() },
			scope: req.scope,
			cwd: req.cwd,
		});
		// Map npm response to URL install response format
		const firstSkill = npmResult.skills[0];
		if (!firstSkill) {
			throw new UserFacingError("no skill was installed", 500);
		}
		const skillPath = npmResult.paths[0] ?? path.join(this.resolveNpmSkillRoot(npmResult.scope, req.cwd), firstSkill);
		return {
			id: encodePathToId(skillPath),
			skillPath,
			dirName: firstSkill,
		};
	}

	// ─── NPM-based skill management (via bunx skills CLI) ──────────────────────

	/**
	 * Resolve the target directory for npm-installed skills.
	 * Uses the universal Agent Skills standard: `.agents/skills` for project,
	 * `~/.agents/skills` for user. Also writes to omp-native paths for omp discovery.
	 */
	private resolveNpmSkillRoot(scope: "user" | "project", cwd?: string): string {
		if (scope === "project") {
			const resolvedCwd = path.resolve(cwd?.trim() || this.config.defaultCwd);
			if (!isCwdAllowed(resolvedCwd, [this.config.defaultCwd, ...this.config.extraWorkspaces])) {
				throw new UserFacingError("project cwd is not under an allowed root", 403);
			}
			return path.join(resolvedCwd, ".agents", "skills");
		}
		return path.join(os.homedir(), ".agents", "skills");
	}

	/**
	 * Install skills from a source via `bunx skills add`.
	 * This supports the full vercel-labs/skills source format:
	 *   - `owner/repo` (GitHub shorthand)
	 *   - `https://github.com/owner/repo` (full URL)
	 *   - `git@github.com:owner/repo.git` (git URL)
	 *   - `./local-path` (local directory)
	 */
	async installFromNpm(req: InstallSkillFromNpmRequest): Promise<InstallSkillFromNpmResponse> {
		const scope = req.scope ?? "user";
		if (scope !== "user" && scope !== "project") {
			throw new UserFacingError("scope must be \"user\" or \"project\"", 400);
		}

		const source = req.source.source.trim();
		if (!source) throw new UserFacingError("source.source is required", 400);

		// Build npx skills add command
		const args = ["skills", "add", source];

		// Scope flag
		if (scope === "user") {
			args.push("-g");
		}

		// Skill filter
		if (req.source.skill) {
			args.push("--skill", req.source.skill);
		}

		// Yes (skip prompts)
		if (req.yes !== false) {
			args.push("-y");
		}

		// Copy mode
		if (req.copy) {
			args.push("--copy");
		}

		const cwd = req.cwd?.trim() || this.config.defaultCwd;
		const resolvedCwd = path.resolve(cwd);

		log.info(`bunx skills add ${source} scope=${scope} cwd=${resolvedCwd}`);

		// bunx for Bun runtime compatibility (~2s startup vs npx's ~5s).
		const cmd = `bunx ${args.map(a => `"${a}"`).join(" ")}`;
		try {
			const { stdout, stderr } = await execFile(cmd, {
				cwd: resolvedCwd,
				timeout: 120_000,
				maxBuffer: 2 * 1024 * 1024,
				env: { ...process.env },
			});
			const output = stdout + (stderr ? `\n${stderr}` : "");
			log.info(`bunx skills add succeeded`);

			// Parse installed skill paths from the target directory
			const root = this.resolveNpmSkillRoot(scope, req.cwd);
			const installedSkils = await listSkillDirs(root);

			// Also install to omp-native root for SDK discovery
			const ompRoot = this.resolveSkillRoot(scope, req.cwd);
			await syncNpmToOmp(root, ompRoot);

			return {
				skills: installedSkils,
				paths: installedSkils.map(s => path.join(root, s)),
				scope,
				output: output.slice(0, 4096),
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`bunx skills add failed`, err);
			throw new UserFacingError(`bunx skills add failed: ${msg}`, 502);
		}
	}

	/** Remove installed skills via `bunx skills remove`. */
	async removeFromNpm(req: RemoveSkillFromNpmRequest): Promise<RemoveSkillFromNpmResponse> {
		const scope = req.scope ?? "user";
		if (scope !== "user" && scope !== "project") {
			throw new UserFacingError("scope must be \"user\" or \"project\"", 400);
		}
		if (!req.skills.length) throw new UserFacingError("skills array is required", 400);

		const skillNames = req.skills.map(s => s.trim()).filter(Boolean);
		if (!skillNames.length) throw new UserFacingError("no valid skill names", 400);

		const args = ["skills", "remove", ...skillNames];

		if (scope === "user") {
			args.push("-g");
		}
		if (req.yes !== false) {
			args.push("-y");
		}

		const cwd = req.cwd?.trim() || this.config.defaultCwd;
		const resolvedCwd = path.resolve(cwd);

		log.info(`bunx skills remove ${skillNames.join(", ")} scope=${scope}`);

		const cmd = `bunx ${args.map(a => `"${a}"`).join(" ")}`;
		try {
			const { stdout, stderr } = await execFile(cmd, {
				cwd: resolvedCwd,
				timeout: 60_000,
				maxBuffer: 512 * 1024,
				env: { ...process.env },
			});
			const output = stdout + (stderr ? `\n${stderr}` : "");
			log.info(`bunx skills remove succeeded`);

			// Clean up from omp-native root as well
			const ompRoot = this.resolveSkillRoot(scope, req.cwd);
			await cleanupOmpSkills(ompRoot, skillNames);

			return {
				skills: skillNames,
				scope,
				output: output.slice(0, 4096),
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`bunx skills remove failed`, err);
			throw new UserFacingError(`bunx skills remove failed: ${msg}`, 502);
		}
	}

	/** List npm-installed skills via `bunx skills list`. */
	async listNpmSkills(req: ListNpmSkillsRequest): Promise<ListNpmSkillsResponse> {
		const scope = req.scope ?? "all";
		if (scope !== "user" && scope !== "project" && scope !== "all") {
			throw new UserFacingError("scope must be \"user\", \"project\", or \"all\"", 400);
		}

		const args = ["skills", "ls"];
		if (scope === "user") args.push("-g");
		if (scope === "project") args.push("-p");

		const cwd = req.cwd?.trim() || this.config.defaultCwd;
		const resolvedCwd = path.resolve(cwd);

		const cmd = `bunx ${args.map(a => `"${a}"`).join(" ")}`;
		try {
			const { stdout, stderr } = await execFile(cmd, {
				cwd: resolvedCwd,
				timeout: 30_000,
				maxBuffer: 512 * 1024,
				env: { ...process.env },
			});
			const output = stdout + (stderr ? `\n${stderr}` : "");

			// Parse npx skills list output to extract skill entries.
			// Output format is a tree with skill names and paths.
			const skills = parseNpmSkillsList(stdout, scope, resolvedCwd);

			return { skills, output: output.slice(0, 4096) };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`bunx skills list failed`, err);
			// Return empty list with error info instead of throwing
			return { skills: [], output: `Error: ${msg}` };
		}
	}
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

// ─── NPM skill helpers ──────────────────────────────────────────────────────

/** List skill directory names under a root. */
async function listSkillDirs(root: string): Promise<string[]> {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		return entries
			.filter(e => e.isDirectory() || e.isSymbolicLink())
			.filter(e => {
				const name = e.name.toLowerCase();
				return name !== "node_modules" && !name.startsWith(".");
			})
			.map(e => e.name);
	} catch {
		return [];
	}
}

/** Symlink/copy skills from .agents/skills to .omp/skills for omp discovery. */
async function syncNpmToOmp(npmRoot: string, ompRoot: string): Promise<void> {
	try {
		const skills = await listSkillDirs(npmRoot);
		await mkdir(ompRoot, { recursive: true });
		for (const skillName of skills) {
			const npmSkillDir = path.join(npmRoot, skillName);
			const ompSkillDir = path.join(ompRoot, skillName);
			// Skip if already exists
			try {
				await stat(ompSkillDir);
				continue;
			} catch {
				// Doesn't exist, create symlink
			}
			// Create symlink using fs (junction on Windows, dir symlink on Unix)
			const rel = path.relative(ompRoot, npmSkillDir);
			await mkdir(path.dirname(ompSkillDir), { recursive: true });
			try {
				await symlink(os.platform() === "win32" ? npmSkillDir : rel, ompSkillDir, os.platform() === "win32" ? "junction" : "dir");
			} catch {
				// Symlink failed (e.g. permission), skip silently
			}
		}
	} catch (err) {
		log.warn(`syncNpmToOmp failed:`, err);
	}
}

/** Remove skill symlinks from omp-native root. */
async function cleanupOmpSkills(ompRoot: string, skillNames: string[]): Promise<void> {
	for (const name of skillNames) {
		const ompSkillDir = path.join(ompRoot, name);
		try {
			await rm(ompSkillDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup failures
		}
	}
}

/** Parse bunx skills list output into structured entries. */
function parseNpmSkillsList(output: string, scopeFilter: string, cwd: string): NpmSkillEntry[] {
	const lines = output.split("\n").filter(l => l.trim());
	const skills: NpmSkillEntry[] = [];

	// npx skills ls outputs in a tree format like:
	// .agents/skills/
	// ├── skill-name (source: owner/repo)
	// └── another-skill
	// We parse lines starting with tree markers or containing skill paths
	for (const line of lines) {
		// Skip header lines like ".agents/skills/" or "~/.agents/skills/"
		if (line.trim().endsWith("/skills/") || line.trim().endsWith("/skills")) continue;
		// Skip empty or separator lines
		if (!line.includes("─") && !line.includes("│") && !line.includes("├") && !line.includes("└")) continue;

		// Extract skill name from tree line
		// Format: "├── skill-name" or "│   └── skill-name" or "└── skill-name (source: owner/repo)"
		const match = line.match(/[├└│─\s]+([a-zA-Z0-9_-]+)/);
		if (!match) continue;

		const name = match[1];
		if (!name || name.startsWith(".")) continue;

		// Extract source if present: "(source: owner/repo)"
		const sourceMatch = line.match(/\(source:\s*([^)]+)\)/);
		const source = sourceMatch?.[1];

		// Determine scope from the header context
		// This is approximate - we rely on the root being user or project based on args
		const skillScope = scopeFilter === "all" ? "project" : (scopeFilter as "user" | "project");

		skills.push({
			name,
			path: scopeFilter === "user"
				? path.join(os.homedir(), ".agents", "skills", name)
				: path.join(cwd, ".agents", "skills", name),
			source,
			scope: skillScope,
		});
	}

	return skills;
}

export type { SkillSummary, SkillFrontmatter, SkillDetailResponse, SkillFile, ListSkillsResponse };

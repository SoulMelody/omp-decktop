/**
 * Filesystem write/manage endpoints for the omp-deck server. Pairs with
 * `routes-fs.ts` (path completion) and `routes-fs-read.ts` (read-only tree +
 * text read). Mirrors the surface area of openchamber's `/api/fs/*` family
 * scoped down to what the deck UI actually needs.
 *
 * Endpoints:
 *   GET    /fs/home
 *   GET    /fs/stat
 *   GET    /fs/raw
 *   GET    /fs/serve/*
 *   GET    /fs/search
 *   POST   /fs/mkdir
 *   POST   /fs/write
 *   POST   /fs/rename
 *   POST   /fs/delete
 *   POST   /fs/reveal
 *   POST   /fs/clone
 *   POST   /fs/grants
 *   POST   /fs/exec
 *   GET    /fs/exec/:jobId
 *   GET    /fs/editor/open
 */

import { Hono } from "hono";
import {
	createReadStream,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

import {
	validateEndpointRequest,
	type FsEntryMeta,
	type FsWriteResponse,
} from "@omp-deck/protocol";

import type { Config } from "./config.ts";
import { isCwdAllowed } from "./fs-allow.ts";
import { consumeGrant, issueGrant } from "./fs-grants.ts";
import { getJob, runJob } from "./fs-exec.ts";
import { searchFilesystemFiles, type SearchHit } from "./fs-search.ts";
import { logger } from "./log.ts";

const log = logger("fs-ops");

const IMAGE_EXTS = new Set([
	"png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif", "svg",
]);
const TEXT_EXTS = new Set([
	"ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc", "md", "mdx",
	"py", "rs", "go", "java", "c", "cpp", "h", "hpp", "css", "scss",
	"less", "html", "htm", "yaml", "yml", "toml", "xml", "ini", "cfg",
	"env", "sh", "bash", "ps1", "txt", "log", "csv", "tsv", "diff",
	"patch", "sql", "Dockerfile", "Makefile",
]);
const MIME_BY_EXT: Record<string, string> = {
	ts: "text/typescript", tsx: "text/tsx",
	js: "text/javascript", jsx: "text/jsx", mjs: "text/javascript", cjs: "text/javascript",
	json: "application/json", jsonc: "application/jsonc",
	html: "text/html", htm: "text/html",
	css: "text/css", scss: "text/scss", less: "text/less",
	xml: "application/xml", yaml: "application/yaml", yml: "application/yaml",
	toml: "application/toml", ini: "text/plain", cfg: "text/plain", env: "text/plain",
	md: "text/markdown", mdx: "text/mdx",
	sql: "application/sql",
	sh: "text/x-shellscript", bash: "text/x-shellscript", ps1: "text/x-powershell",
	diff: "text/x-diff", patch: "text/x-diff",
	png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
	webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif",
	svg: "image/svg+xml",
};

export function buildFsOpsRouter(config: Config): Hono {
	const app = new Hono();
	const allowedRoots = [config.defaultCwd, ...config.extraWorkspaces];
	const cloneRateState = new Map<string, number[]>();

	// ─── read endpoints ──────────────────────────────────────────────────

	app.get("/fs/home", (c) => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
		if (!home) return c.json({ error: "home not found" }, 500);
		return c.json({ home });
	});

	app.get("/fs/stat", (c) => {
		const cwd = c.req.query("cwd");
		const target = c.req.query("path");
		if (!cwd || !target) return c.json({ ok: false, error: "missing cwd or path" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		const abs = safeJoin(cwd, target);
		if (!abs) return c.json({ ok: false, error: "path escapes cwd" }, 403);
		try {
			const entry = readStat(abs, cwd, target);
			return c.json({ ok: true, entry });
		} catch (err) {
			return c.json({ ok: false, error: errnoToMessage(err) }, statusForErr(err));
		}
	});

	app.get("/fs/raw", (c) => {
		const cwd = c.req.query("cwd");
		const target = c.req.query("path");
		if (!cwd || !target) return c.json({ error: "missing cwd or path" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ error: "cwd not allowed" }, 403);
		const abs = safeJoin(cwd, target);
		if (!abs) return c.json({ error: "path escapes cwd" }, 403);
		try {
			const st = statSync(abs);
			if (st.isDirectory()) return c.json({ error: "is a directory" }, 400);
			if (st.size > config.maxRawBytes) return c.json({ error: "file too large" }, 413);
			const ext = extOf(target);
			const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
			const buf = readFileSync(abs);
			return new Response(buf, {
				status: 200,
				headers: {
					"Content-Type": mime,
					"Content-Length": String(buf.byteLength),
					"Cache-Control": "no-store",
				},
			});
		} catch (err) {
			return c.json({ error: errnoToMessage(err) }, statusForErr(err));
		}
	});

	app.get("/fs/serve/*", async (c) => {
		// Anything under /fs/serve/ is a passthrough for the static preview;
		// we re-anchor it against `cwd` from a query param.
		const cwd = c.req.query("cwd");
		const tail = c.req.path.replace(/^\/fs\/serve\/?/, "");
		if (!cwd) return c.json({ error: "missing cwd" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ error: "cwd not allowed" }, 403);
		const abs = safeJoin(cwd, decodeURIComponent(tail));
		if (!abs) return c.json({ error: "path escapes cwd" }, 403);
		try {
			const st = statSync(abs);
			if (st.isDirectory()) return c.json({ error: "is a directory" }, 400);
			const stream = createReadStream(abs);
			const ext = extOf(tail);
			const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
			return new Response(stream as unknown as ReadableStream, {
				status: 200,
				headers: { "Content-Type": mime, "Content-Length": String(st.size) },
			});
		} catch (err) {
			return c.json({ error: errnoToMessage(err) }, statusForErr(err));
		}
	});

	app.get("/fs/search", async (c) => {
		const cwd = c.req.query("cwd");
		const q = c.req.query("q") ?? "";
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		if (!q) return c.json({ ok: true, hits: [] });
		const type = c.req.query("type") as "file" | "directory" | "all" | undefined;
		const dirs = c.req.query("dirs") === "true";
		const limit = clampInt(c.req.query("limit"), 50, 1, 200);
		const respectGitignore = c.req.query("respectGitignore") !== "false";
		try {
			const hits = await searchFilesystemFiles(cwd, {
				query: q,
				type: type ?? (dirs ? "all" : "file"),
				dirs,
				limit,
				respectGitignore,
			});
			return c.json({ ok: true, hits: hits.map(toFsEntryMeta) });
		} catch (err) {
			log.error("search failed", err);
			return c.json({ ok: false, error: "search failed" }, 500);
		}
	});

	app.get("/fs/editor/open", (c) => {
		const cwd = c.req.query("cwd");
		const target = c.req.query("path");
		if (!cwd || !target) return c.json({ ok: false, error: "missing cwd or path" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		const abs = safeJoin(cwd, target);
		if (!abs) return c.json({ ok: false, error: "path escapes cwd" }, 403);
		try {
			const st = statSync(abs);
			if (st.isDirectory()) return c.json({ ok: false, error: "is a directory" }, 400);
			const ext = extOf(target);
			const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
			const buf = readFileSync(abs);
			const sha256 = createHash("sha256").update(buf).digest("hex");
			const content = TEXT_EXTS.has(ext) || ext === ""
				? new TextDecoder("utf-8").decode(buf)
				: ""; // binary — caller should fall back to /fs/raw
			return c.json({ ok: true, path: target, content, sha256, size: st.size, mime });
		} catch (err) {
			return c.json({ ok: false, error: errnoToMessage(err) }, statusForErr(err));
		}
	});

	// ─── write endpoints ─────────────────────────────────────────────────

	app.post("/fs/mkdir", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.mkdir", body);
		if (!v.valid) return c.json({ ok: false, error: validationError(v.errors) }, 400);
		const req = body as { cwd: string; path: string; recursive?: boolean; grantToken?: string };
		if (!isCwdAllowed(req.cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		const abs = safeJoin(req.cwd, req.path);
		if (!abs) {
			if (!req.grantToken) return c.json({ ok: false, error: "path escapes cwd" }, 403);
			const granted = consumeGrant(req.grantToken, path.resolve(req.cwd, "..", req.path));
			if (!granted) return c.json({ ok: false, error: "grant rejected" }, 403);
			const r = doMkdir(granted, req.recursive ?? true);
			return c.json(r.body, r.status as 200 | 400 | 403 | 404 | 500);
		}
		const r = doMkdir(abs, req.recursive ?? true);
		return c.json(r.body, r.status as 200 | 400 | 403 | 404 | 500);
	});

	app.post("/fs/write", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.write", body);
		if (!v.valid) return c.json({ ok: false, error: validationError(v.errors) }, 400);
		const req = body as {
			cwd: string; path: string; content: string;
			encoding?: "utf-8" | "base64"; expectedSha256?: string; grantToken?: string;
		};
		if (!isCwdAllowed(req.cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);

		// Decode the content payload, respecting the encoding hint and the
		// hard size cap from config.
		const encoding = req.encoding ?? "utf-8";
		const buf = encoding === "base64"
			? Buffer.from(req.content, "base64")
			: Buffer.from(req.content, "utf-8");
		if (buf.byteLength > config.maxWriteBytes) {
			return c.json<FsWriteResponse>({
				ok: false, error: `content exceeds maxWriteBytes (${config.maxWriteBytes})`,
			}, 413);
		}

		const abs = safeJoin(req.cwd, req.path);
		let target = abs;
		if (!target) {
			if (!req.grantToken) return c.json<FsWriteResponse>({ ok: false, error: "path escapes cwd" }, 403);
			target = consumeGrant(req.grantToken, path.resolve(req.cwd, "..", req.path));
			if (!target) return c.json<FsWriteResponse>({ ok: false, error: "grant rejected" }, 403);
		}

		// Stale check: if the caller supplied expectedSha256, refuse the
		// write when the file's current hash differs.
		if (req.expectedSha256 && existsSync(target)) {
			const cur = createHash("sha256").update(readFileSync(target)).digest("hex");
			if (cur !== req.expectedSha256) {
				const st = statSync(target);
				return c.json<FsWriteResponse>({
					ok: false,
					error: "stale",
					stale: { serverSha256: cur, serverSize: st.size },
				}, 409);
			}
		}

		// Atomic write: write to a sibling tmp file, then rename. The tmp
		// file is in the same directory so the rename is atomic on the
		// same filesystem (POSIX rename guarantees this).
		const parent = path.dirname(target);
		try { mkdirSync(parent, { recursive: true }); } catch { /* exists */ }
		const tmp = `${target}.tmp_${process.pid}_${Date.now().toString(36)}`;
		try {
			writeFileSync(tmp, buf);
			const { renameSync } = await import("node:fs");
			renameSync(tmp, target);
		} catch (err) {
			try { (await import("node:fs")).unlinkSync(tmp); } catch { /* ignore */ }
			return c.json<FsWriteResponse>({ ok: false, error: errnoToMessage(err) }, statusForErr(err));
		}

		const sha256 = createHash("sha256").update(buf).digest("hex");
		return c.json<FsWriteResponse>({
			ok: true, path: req.path, size: buf.byteLength, sha256,
		});
	});

	app.post("/fs/rename", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.rename", body);
		if (!v.valid) return c.json({ ok: false, error: validationError(v.errors) }, 400);
		const req = body as { cwd: string; from: string; to: string; overwrite?: boolean; grantToken?: string };
		if (!isCwdAllowed(req.cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		const fromAbs = safeJoin(req.cwd, req.from);
		const toAbs = safeJoin(req.cwd, req.to);
		if (!fromAbs || !toAbs) return c.json({ ok: false, error: "path escapes cwd" }, 403);
		try {
			if (existsSync(toAbs) && !req.overwrite) return c.json({ ok: false, error: "target exists" }, 409);
			const { renameSync, mkdirSync: mk } = await import("node:fs");
			try { mk(path.dirname(toAbs), { recursive: true }); } catch { /* exists */ }
			renameSync(fromAbs, toAbs);
			return c.json({ ok: true, path: req.to });
		} catch (err) {
			return c.json({ ok: false, error: errnoToMessage(err) }, statusForErr(err));
		}
	});

	app.post("/fs/delete", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.delete", body);
		if (!v.valid) return c.json({ ok: false, error: validationError(v.errors) }, 400);
		const req = body as { cwd: string; path: string; recursive?: boolean; grantToken?: string };
		if (!isCwdAllowed(req.cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		const abs = safeJoin(req.cwd, req.path);
		if (!abs) return c.json({ ok: false, error: "path escapes cwd" }, 403);
		try {
			const st = statSync(abs);
			if (st.isDirectory() && !req.recursive) {
				// refuse non-recursive delete of non-empty dirs
				const { readdirSync } = await import("node:fs");
				const kids = readdirSync(abs);
				if (kids.length > 0) return c.json({ ok: false, error: "directory not empty" }, 400);
			}
			const { rmSync } = await import("node:fs");
			rmSync(abs, { recursive: !!req.recursive, force: false });
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ ok: false, error: errnoToMessage(err) }, statusForErr(err));
		}
	});

	app.post("/fs/reveal", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.reveal", body);
		if (!v.valid) return c.json({ ok: false, error: validationError(v.errors) }, 400);
		const req = body as { cwd?: string; path: string; via?: "browser" | "desktop" };
		const hint: "browser" | "desktop" = req.via ?? "browser";
		return c.json({ ok: true, hint });
	});

	app.post("/fs/grants", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.grant", body);
		if (!v.valid) return c.json({ error: validationError(v.errors) }, 400);
		const req = body as { path: string; ttlMs?: number; reason?: string };
		const grant = issueGrant(req.path, { ttlMs: req.ttlMs });
		return c.json({ token: grant.token, expiresAt: grant.expiresAt });
	});

	// ─── clone / exec ────────────────────────────────────────────────────

	app.post("/fs/clone", async (c) => {
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.clone", body);
		if (!v.valid) return c.json({ ok: false, error: validationError(v.errors) }, 400);
		const req = body as { cwd: string; remoteUrl: string; destinationPath: string; identityId?: string };
		if (!isCwdAllowed(req.cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);

		// Rate-limit: max N clones per window per cwd.
		const now = Date.now();
		const recent = cloneRateState.get(req.cwd) ?? [];
		const cutoff = now - config.cloneRateLimit.windowMs;
		const filtered = recent.filter((t) => t > cutoff);
		if (filtered.length >= config.cloneRateLimit.maxPerWindow) {
			return c.json({ ok: false, error: "rate limited; slow down" }, 429);
		}
		filtered.push(now);
		cloneRateState.set(req.cwd, filtered);

		const destAbs = safeJoin(req.cwd, req.destinationPath);
		const resolvedDest = destAbs ?? path.resolve(req.cwd, req.destinationPath);
		try {
			const args = ["clone", "--", req.remoteUrl, path.basename(resolvedDest)];
			const proc = Bun.spawn({
				cmd: ["git", ...args],
				cwd: destAbs ?? req.cwd,
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				return c.json({ ok: false, error: stderr.trim() || `git clone failed (exit ${exitCode})` }, 500);
			}
			return c.json({ ok: true, path: resolvedDest });
		} catch (err) {
			log.error("clone failed", err);
			return c.json({ ok: false, error: errnoToMessage(err) }, 500);
		}
	});

	app.post("/fs/exec", async (c) => {
		if (!config.enableFsExec) {
			return c.json({ error: "exec disabled" }, 403);
		}
		const body = await readJsonBody(c.req.raw);
		const v = validateEndpointRequest("fs.exec", body);
		if (!v.valid) return c.json({ error: validationError(v.errors) }, 400);
		const req = body as { cwd: string; cmd: string; args?: string[]; timeoutMs?: number; label?: string };
		if (!isCwdAllowed(req.cwd, allowedRoots)) return c.json({ error: "cwd not allowed" }, 403);
		const { jobId } = runJob({
			cwd: req.cwd,
			cmd: req.cmd,
			args: req.args,
			timeoutMs: Math.min(req.timeoutMs ?? config.execTimeoutMs, config.execTimeoutMs),
			label: req.label,
		});
		return c.json({ jobId });
	});

	app.get("/fs/exec/:jobId", (c) => {
		const jobId = c.req.param("jobId");
		const job = getJob(jobId);
		if (!job) return c.json({ error: "job not found" }, 404);
		return c.json(job);
	});

	function doMkdir(abs: string, recursive: boolean): { body: unknown; status: number } {
		try {
			mkdirSync(abs, { recursive });
			return { body: { ok: true, path: abs }, status: 200 };
		} catch (err) {
			return { body: { ok: false, error: errnoToMessage(err) }, status: statusForErr(err) };
		}
	}

	return app;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve `path` against `cwd`, refusing paths that escape. Returns the
 * absolute path on success, or `null` if the path tries to walk out.
 */
function safeJoin(cwd: string, target: string): string | null {
	const resolvedCwd = path.resolve(cwd);
	const resolved = path.resolve(resolvedCwd, target);
	const rel = path.relative(resolvedCwd, resolved);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
	return resolved;
}

function readStat(abs: string, cwd: string, target: string): FsEntryMeta {
	const st = statSync(abs);
	const ext = extOf(target);
	return {
		name: path.basename(abs),
		path: target,
		isDir: st.isDirectory(),
		isFile: st.isFile(),
		isSymlink: st.isSymbolicLink(),
		size: st.size,
		mtimeMs: st.mtimeMs,
		mode: st.mode,
		mime: MIME_BY_EXT[ext] ?? "application/octet-stream",
	};
}

function toFsEntryMeta(h: SearchHit): FsEntryMeta {
	return {
		name: h.name,
		path: h.path,
		isDir: h.isDir,
		isFile: h.isFile,
		isSymlink: h.isSymlink,
	};
}

function extOf(name: string): string {
	const i = name.lastIndexOf(".");
	if (i === -1) return "";
	return name.slice(i + 1).toLowerCase();
}

function errnoToMessage(err: unknown): string {
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	if (code === "ENOENT") return "file not found";
	if (code === "EACCES" || code === "EPERM") return "permission denied";
	if (code === "EEXIST") return "already exists";
	if (code === "ENOTEMPTY") return "directory not empty";
	return (err as Error)?.message ?? "fs error";
}

function statusForErr(err: unknown): 400 | 403 | 404 | 409 | 413 | 500 {
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	if (code === "ENOENT") return 404;
	if (code === "EACCES" || code === "EPERM") return 403;
	if (code === "EEXIST") return 409;
	return 500;
}

async function readJsonBody(raw: Request): Promise<unknown> {
	try {
		return await raw.json();
	} catch {
		return null;
	}
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
	if (!raw) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, Math.trunc(n)));
}

function validationError(errors: Array<{ path: string; keyword: string; message: string }> | undefined): string {
	if (!errors || errors.length === 0) return "invalid request";
	return errors[0]?.message ?? "invalid request";
}
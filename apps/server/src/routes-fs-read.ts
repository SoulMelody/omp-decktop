import { Hono } from "hono";
import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import type { Config } from "./config.ts";
import { isCwdAllowed } from "./fs-allow.ts";
import { logger } from "./log.ts";

const log = logger("fs-read");

const TEXT_EXTS = new Set([
	"ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java",
	"c", "cpp", "h", "hpp", "css", "scss", "less", "html", "htm",
	"json", "jsonc", "yaml", "yml", "md", "mdx", "sql", "sh", "bash",
	"ps1", "toml", "xml", "ini", "cfg", "env", "gitignore",
	"dockerignore", "editorconfig", "Makefile", "Dockerfile",
	"txt", "log", "csv", "tsv", "diff", "patch", "svg",
]);

const IMAGE_EXTS = new Set([
	"png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif",
]);

const MAX_TEXT_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 10_000_000;

const SKIP_DIRS = new Set([
	"node_modules", ".git", "__pycache__", ".next", "dist", "build",
	"target", ".turbo", ".cache", "coverage", ".nyc_output",
]);

function getExt(f: string): string {
	const d = f.lastIndexOf(".");
	return d === -1 ? "" : f.slice(d + 1).toLowerCase();
}

function mimeFromExt(ext: string): string {
	if (TEXT_EXTS.has(ext)) return `text/${ext === "tsx" ? "tsx" : ext === "jsx" ? "jsx" : ext}`;
	if (IMAGE_EXTS.has(ext)) return `image/${ext === "jpg" ? "jpeg" : ext === "svg" ? "svg+xml" : ext}`;
	return "application/octet-stream";
}

function isTextFile(ext: string): boolean { return TEXT_EXTS.has(ext) || ext === ""; }
function isImageFile(ext: string): boolean { return IMAGE_EXTS.has(ext); }
function isPreviewable(ext: string): boolean { return isTextFile(ext) || isImageFile(ext); }

export function buildFsReadRouter(config: Config): Hono {
	const app = new Hono();
	const allowedRoots = [config.defaultCwd, ...config.extraWorkspaces];

	app.get("/fs/read", (c) => {
		const cwd = c.req.query("cwd");
		const path = c.req.query("path");
		if (!cwd || !path) return c.json({ ok: false, error: "missing cwd or path" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);

		const resolved = resolve(cwd, path);
		if (!resolved.startsWith(resolve(cwd) + sep) && resolved !== resolve(cwd))
			return c.json({ ok: false, error: "path escapes cwd" }, 403);

		try {
			const st = statSync(resolved);
			if (st.isDirectory()) return c.json({ ok: false, error: "is a directory" }, 400);

			const ext = getExt(path);
			if (!isPreviewable(ext)) return c.json({ ok: false, error: "unsupported file type" }, 415);
			if (isTextFile(ext) && st.size > MAX_TEXT_BYTES) return c.json({ ok: false, error: "file too large" }, 413);
			if (isImageFile(ext) && st.size > MAX_IMAGE_BYTES) return c.json({ ok: false, error: "file too large" }, 413);

			if (isTextFile(ext)) {
				const content = readFileSync(resolved, "utf-8");
				return c.json({ ok: true, content, mime: mimeFromExt(ext), size: st.size });
			}
			const buf = readFileSync(resolved);
			const b64 = Buffer.from(buf).toString("base64");
			return c.json({ ok: true, content: b64, mime: mimeFromExt(ext), size: st.size });
		} catch (err: any) {
			if (err.code === "ENOENT") return c.json({ ok: false, error: "file not found" }, 404);
			if (err.code === "EACCES" || err.code === "EPERM") return c.json({ ok: false, error: "permission denied" }, 403);
			log.error(`read failed: ${resolved}`, err);
			return c.json({ ok: false, error: "read failed" }, 500);
		}
	});

	app.get("/fs/tree", (c) => {
		const cwd = c.req.query("cwd");
		const rawPath = c.req.query("path") ?? "";
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isCwdAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);

		const target = resolve(cwd, rawPath);
		if (!target.startsWith(resolve(cwd) + sep) && target !== resolve(cwd))
			return c.json({ ok: false, error: "path escapes cwd" }, 403);

		try {
			const names = readdirSync(target, { withFileTypes: true });
			const entries = names
				.filter((d) => !SKIP_DIRS.has(d.name) && !d.name.startsWith("."))
				.map((d) => {
					const rel = relative(cwd, resolve(target, d.name)).replace(/\\/g, "/");
					return {
						name: d.name,
						path: d.isDirectory() ? rel + "/" : rel,
						isDir: d.isDirectory(),
					};
				})
				.sort((a, b) => {
					if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
					return a.name.localeCompare(b.name);
				});
			return c.json({ ok: true, entries });
		} catch (err: any) {
			if (err.code === "ENOENT") return c.json({ ok: false, error: "directory not found" }, 404);
			if (err.code === "EACCES" || err.code === "EPERM") return c.json({ ok: false, error: "permission denied" }, 403);
			log.error("tree failed: " + target, err);
			return c.json({ ok: false, error: "readdir failed" }, 500);
		}
	});

	return app;
}

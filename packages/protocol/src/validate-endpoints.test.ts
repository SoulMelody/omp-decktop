/**
 * Tests for the per-endpoint file/git operation validators. Each endpoint
 * should accept the canonical happy-path body and reject the obvious
 * malformed shapes (missing required field, wrong type, bad enum).
 *
 * Fixtures are inline rather than JSON files to keep the protocol package
 * dep-free; the structure is identical to what the server will receive.
 */

import { describe, expect, test } from "bun:test";

import { validateEndpointRequest } from "./validate.ts";

describe("validateEndpointRequest — fs operations", () => {
	test("fs.mkdir accepts recursive flag", () => {
		const r = validateEndpointRequest("fs.mkdir", {
			cwd: "/home/u/repo",
			path: "src/new",
			recursive: true,
		});
		expect(r.valid).toBe(true);
	});

	test("fs.mkdir rejects missing cwd", () => {
		const r = validateEndpointRequest("fs.mkdir", { path: "x" });
		expect(r.valid).toBe(false);
		expect(r.errors?.[0]?.keyword).toBe("required");
	});

	test("fs.write rejects content without encoding mismatch", () => {
		const r = validateEndpointRequest("fs.write", {
			cwd: "/home/u",
			path: "a",
			content: "hi",
			encoding: "hex", // not in enum
		});
		expect(r.valid).toBe(false);
		expect(r.errors?.[0]?.keyword).toBe("enum");
	});

	test("fs.write accepts expectedSha256 matching pattern", () => {
		const r = validateEndpointRequest("fs.write", {
			cwd: "/home/u",
			path: "a",
			content: "hi",
			expectedSha256: "a".repeat(64),
		});
		expect(r.valid).toBe(true);
	});

	test("fs.write rejects malformed sha256", () => {
		const r = validateEndpointRequest("fs.write", {
			cwd: "/home/u",
			path: "a",
			content: "hi",
			expectedSha256: "not-a-hash",
		});
		expect(r.valid).toBe(false);
		expect(r.errors?.[0]?.keyword).toBe("pattern");
	});

	test("fs.rename requires from/to", () => {
		const r = validateEndpointRequest("fs.rename", { cwd: "/home/u", from: "a" });
		expect(r.valid).toBe(false);
		expect(r.errors?.some((e) => e.params && "missingProperty" in e.params && e.params.missingProperty === "to")).toBe(true);
	});

	test("fs.reveal only requires path", () => {
		const r = validateEndpointRequest("fs.reveal", { path: "/home/u/file" });
		expect(r.valid).toBe(true);
	});

	test("fs.reveal rejects unknown via", () => {
		const r = validateEndpointRequest("fs.reveal", { path: "/home/u/file", via: "magic" });
		expect(r.valid).toBe(false);
	});

	test("fs.search requires q", () => {
		const r = validateEndpointRequest("fs.search", { cwd: "/home/u" });
		expect(r.valid).toBe(false);
	});

	test("fs.search limit is bounded", () => {
		const r = validateEndpointRequest("fs.search", { cwd: "/home/u", q: "x", limit: 9999 });
		expect(r.valid).toBe(false);
		expect(r.errors?.[0]?.keyword).toBe("maximum");
	});

	test("fs.clone accepts https URL", () => {
		const r = validateEndpointRequest("fs.clone", {
			cwd: "/home/u",
			remoteUrl: "https://github.com/foo/bar.git",
			destinationPath: "bar",
		});
		expect(r.valid).toBe(true);
	});

	test("fs.clone accepts ssh URL", () => {
		const r = validateEndpointRequest("fs.clone", {
			cwd: "/home/u",
			remoteUrl: "git@github.com:foo/bar.git",
			destinationPath: "bar",
		});
		expect(r.valid).toBe(true);
	});

	test("fs.clone rejects file:// scheme", () => {
		const r = validateEndpointRequest("fs.clone", {
			cwd: "/home/u",
			remoteUrl: "file:///etc/passwd",
			destinationPath: "x",
		});
		expect(r.valid).toBe(false);
	});

	test("fs.exec timeoutMs respects bounds", () => {
		const r = validateEndpointRequest("fs.exec", {
			cwd: "/home/u",
			cmd: "npm",
			args: ["install"],
			timeoutMs: 50, // below minimum of 100
		});
		expect(r.valid).toBe(false);
	});

	test("fs.grant requires path", () => {
		const r = validateEndpointRequest("fs.grant", { ttlMs: 5000 });
		expect(r.valid).toBe(false);
	});

	test("fs.editor.open requires cwd + path", () => {
		const r = validateEndpointRequest("fs.editor.open", { cwd: "/x" });
		expect(r.valid).toBe(false);
	});
});

describe("validateEndpointRequest — git operations", () => {
	test("git.stage requires non-empty paths", () => {
		const r = validateEndpointRequest("git.stage", { cwd: "/x", paths: [] });
		expect(r.valid).toBe(false);
		expect(r.errors?.[0]?.keyword).toBe("minItems");
	});

	test("git.revert default scope is working", () => {
		const r = validateEndpointRequest("git.revert", { cwd: "/x", path: "a" });
		expect(r.valid).toBe(true);
	});

	test("git.commit requires message", () => {
		const r = validateEndpointRequest("git.commit", { cwd: "/x" });
		expect(r.valid).toBe(false);
	});

	test("git.push force must be lease/no", () => {
		const r = validateEndpointRequest("git.push", { cwd: "/x", force: "yes" });
		expect(r.valid).toBe(false);
	});

	test("git.branch.create accepts new branch", () => {
		const r = validateEndpointRequest("git.branch.create", {
			cwd: "/x", name: "feature/x", startPoint: "main",
		});
		expect(r.valid).toBe(true);
	});

	test("git.branch.create rejects empty name", () => {
		const r = validateEndpointRequest("git.branch.create", { cwd: "/x", name: "" });
		expect(r.valid).toBe(false);
	});

	test("git.checkout requires branch", () => {
		const r = validateEndpointRequest("git.checkout", { cwd: "/x" });
		expect(r.valid).toBe(false);
	});

	test("git.log default maxCount is applied server-side", () => {
		const r = validateEndpointRequest("git.log", { cwd: "/x", maxCount: 500 });
		expect(r.valid).toBe(true);
	});

	test("git.log rejects maxCount > 500", () => {
		const r = validateEndpointRequest("git.log", { cwd: "/x", maxCount: 1000 });
		expect(r.valid).toBe(false);
	});

	test("git.merge requires branch", () => {
		const r = validateEndpointRequest("git.merge", { cwd: "/x" });
		expect(r.valid).toBe(false);
	});

	test("git.rebase requires onto", () => {
		const r = validateEndpointRequest("git.rebase", { cwd: "/x" });
		expect(r.valid).toBe(false);
	});

	test("git.cherryPick requires sha", () => {
		const r = validateEndpointRequest("git.cherryPick", { cwd: "/x" });
		expect(r.valid).toBe(false);
	});

	test("git.reset requires mode", () => {
		const r = validateEndpointRequest("git.reset", { cwd: "/x", sha: "abcdef0", mode: "hard" });
		expect(r.valid).toBe(true);
	});

	test("git.reset rejects unknown mode", () => {
		const r = validateEndpointRequest("git.reset", { cwd: "/x", sha: "abcdef0", mode: "nuclear" });
		expect(r.valid).toBe(false);
	});

	test("git.worktree.create requires mode enum", () => {
		const r = validateEndpointRequest("git.worktree.create", {
			cwd: "/x", path: "/wt", mode: "new",
		});
		expect(r.valid).toBe(true);
	});

	test("git.worktree.create rejects bad mode", () => {
		const r = validateEndpointRequest("git.worktree.create", {
			cwd: "/x", path: "/wt", mode: "shiny",
		});
		expect(r.valid).toBe(false);
	});

	test("git.setIdentity requires valid email", () => {
		const r = validateEndpointRequest("git.setIdentity", {
			cwd: "/x", userName: "u", userEmail: "not-email",
		});
		expect(r.valid).toBe(false);
		expect(r.errors?.[0]?.keyword).toBe("format");
	});

	test("git.remote.deleteBranch defaults remote to origin server-side", () => {
		const r = validateEndpointRequest("git.remote.deleteBranch", { cwd: "/x", branch: "old" });
		expect(r.valid).toBe(true);
	});
});
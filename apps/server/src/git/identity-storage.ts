/**
 * Identity helpers for git.
 *
 * Two layers of identity:
 *   1. Global (`user.name` / `user.email` from `~/.gitconfig` or env vars).
 *   2. Per-workspace (`user.name` / `user.email` in `<repo>/.git/config`).
 *
 * This module also surfaces a small registry of stored "identities" —
 * pre-configured profiles (name + email + optional SSH key) that the user
 * can pick from when the workspace has no local identity.
 *
 * The registry itself is persisted under `config.agentDir/.git-identities.json`
 * so it survives restarts. Stored values never include secrets.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { runGit } from "./runGit.ts";

export interface GitIdentity {
	id: string;
	userName: string;
	userEmail: string;
	authType: "https" | "ssh";
	sshKeyPath?: string;
	isGlobal: boolean;
	updatedAt: string;
}

interface IdentityFile {
	identities: GitIdentity[];
}

/**
 * Resolve the global identity by asking git itself. `git config --global
 * user.name/user.email` reads from `~/.gitconfig` and is the canonical
 * source — we don't parse the file ourselves.
 */
export async function getGlobalIdentity(): Promise<{ userName: string | null; userEmail: string | null; sshCommand: string | null }> {
	const cwd = os.homedir();
	const [nameRes, emailRes, sshRes] = await Promise.all([
		runGit({ cwd, args: ["config", "--global", "--get", "user.name"], label: "git-config-get-name" }),
		runGit({ cwd, args: ["config", "--global", "--get", "user.email"], label: "git-config-get-email" }),
		runGit({ cwd, args: ["config", "--global", "--get", "core.sshCommand"], label: "git-config-get-ssh" }),
	]);
	return {
		userName: nameRes.ok && nameRes.stdout.trim() ? nameRes.stdout.trim() : null,
		userEmail: emailRes.ok && emailRes.stdout.trim() ? emailRes.stdout.trim() : null,
		sshCommand: sshRes.ok && sshRes.stdout.trim() ? sshRes.stdout.trim() : null,
	};
}

/**
 * Read the local identity (from `<repo>/.git/config`). Returns null fields
 * when nothing is set locally — callers typically fall back to global.
 */
export async function getLocalIdentity(cwd: string): Promise<{ userName: string | null; userEmail: string | null }> {
	const [nameRes, emailRes] = await Promise.all([
		runGit({ cwd, args: ["config", "--get", "user.name"], label: "git-config-local-name" }),
		runGit({ cwd, args: ["config", "--get", "user.email"], label: "git-config-local-email" }),
	]);
	return {
		userName: nameRes.ok && nameRes.stdout.trim() ? nameRes.stdout.trim() : null,
		userEmail: emailRes.ok && emailRes.stdout.trim() ? emailRes.stdout.trim() : null,
	};
}

/**
 * Set the local identity on a repo. Writes both `user.name` and `user.email`
 * to `<repo>/.git/config`. Fails if the cwd is not a git repo.
 */
export async function setLocalIdentity(cwd: string, profile: { userName: string; userEmail: string; sshKeyPath?: string }): Promise<void> {
	await runGit({ cwd, args: ["config", "user.name", profile.userName], label: "git-config-set-name" });
	await runGit({ cwd, args: ["config", "user.email", profile.userEmail], label: "git-config-set-email" });
	if (profile.sshKeyPath) {
		const cmd = `ssh -i ${escapeSshKeyPath(profile.sshKeyPath)} -o IdentitiesOnly=yes`;
		await runGit({ cwd, args: ["config", "core.sshCommand", cmd], label: "git-config-set-ssh" });
	}
}

/**
 * Build a `core.sshCommand` string that pins the SSH key. The path is
 * shell-escaped so spaces / quotes can't smuggle command flags.
 */
export function escapeSshKeyPath(p: string): string {
	// Wrap in double quotes and escape any embedded quotes / backslashes.
	return `"${p.replace(/(["\\$`])/g, "\\$1")}"`;
}

// ─── Identity registry ─────────────────────────────────────────────────────

/**
 * Resolve the path to the identities file. Lives in the agent dir so the
 * data is per-agent and survives across workspaces.
 */
export function identitiesPath(agentDir?: string): string {
	const root = agentDir ?? path.join(os.homedir(), ".omp", "agent");
	return path.join(root, "git-identities.json");
}

export async function listIdentities(agentDir?: string): Promise<GitIdentity[]> {
	const file = identitiesPath(agentDir);
	try {
		const raw = await fs.readFile(file, "utf-8");
		const parsed = JSON.parse(raw) as IdentityFile;
		return parsed.identities ?? [];
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}
}

export async function saveIdentity(agentDir: string | undefined, identity: Omit<GitIdentity, "updatedAt">): Promise<GitIdentity> {
	const file = identitiesPath(agentDir);
	const existing = await listIdentities(agentDir);
	const next: GitIdentity = { ...identity, updatedAt: new Date().toISOString() };
	const replaced = existing.filter((i) => i.id !== next.id);
	replaced.push(next);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, JSON.stringify({ identities: replaced } satisfies IdentityFile, null, 2), "utf-8");
	return next;
}

export async function deleteIdentity(agentDir: string | undefined, id: string): Promise<boolean> {
	const file = identitiesPath(agentDir);
	const existing = await listIdentities(agentDir);
	const filtered = existing.filter((i) => i.id !== id);
	if (filtered.length === existing.length) return false;
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, JSON.stringify({ identities: filtered } satisfies IdentityFile, null, 2), "utf-8");
	return true;
}

/** Verify that an SSH key path exists and is readable. */
export async function validateSshKey(p: string): Promise<boolean> {
	try {
		const st = await fs.stat(p);
		if (!st.isFile()) return false;
		// Sanity check the key shape — refuse if the first 80 chars don't
		// look like an OpenSSH key. Not a security check; just prevents
		// accidental misconfiguration.
		const f = await fs.open(p, "r");
		try {
			const buf = Buffer.alloc(80);
			await f.read(buf, 0, 80, 0);
			const head = buf.toString("utf-8");
			return head.includes("PRIVATE KEY") || head.includes("OPENSSH PRIVATE KEY");
		} finally {
			await f.close();
		}
	} catch {
		return false;
	}
}
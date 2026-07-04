import { describe, expect, test } from "bun:test";
import { detectShell } from "./terminal-service.ts";

describe("detectShell", () => {
	test("uses which on Unix/Android", () => {
		expect(detectShell("android", {}, () => "/data/data/com.termux/files/usr/bin/bash")).toBe(
			"/data/data/com.termux/files/usr/bin/bash",
		);
	});

	test("falls back to /bin/bash on Unix when which misses", () => {
		expect(detectShell("linux", {}, () => null)).toBe("/bin/bash");
	});

	test("ignores which on Windows and uses Git Bash directly", () => {
		// Even if which returns a WSL bash, we ignore it
		expect(
			detectShell("win32", { ProgramFiles: "C:\\Program Files" }, () => "/mnt/c/Windows/System32/bash.exe"),
		).toBe("C:\\Program Files\\Git\\bin\\bash.exe");
	});

	test("uses default Git Bash path on Windows without ProgramFiles", () => {
		expect(detectShell("win32", {}, () => null)).toBe("C:\\Program Files\\Git\\bin\\bash.exe");
	});
});

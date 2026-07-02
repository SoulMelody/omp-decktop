import { describe, expect, test } from "bun:test";
import { detectShell } from "./terminal-service.ts";

describe("detectShell", () => {
	test("uses Bun.which before platform fallbacks", () => {
		expect(detectShell("android", {}, () => "/data/data/com.termux/files/usr/bin/bash")).toBe(
			"/data/data/com.termux/files/usr/bin/bash",
		);
	});

	test("falls back to /bin/bash on Unix when Bun.which misses", () => {
		expect(detectShell("linux", {}, () => null)).toBe("/bin/bash");
	});

	test("uses Git Bash on Windows when Bun.which misses", () => {
		expect(detectShell("win32", { ProgramFiles: "C:\\Program Files" }, () => null)).toBe(
			"C:\\Program Files\\Git\\bin\\bash.exe",
		);
	});
});

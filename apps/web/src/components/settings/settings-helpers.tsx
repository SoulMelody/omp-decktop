import type { BridgeInfo, EnvEntry, NotificationLevel } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";

export const SECTIONS = [
	{ id: "env", label: "Env", description: "Process and deck-managed variables" },
	{ id: "providers", label: "Providers", description: "OAuth sign-in and API-key state" },
	{ id: "messaging", label: "Messaging", description: "Telegram and future chat bridges" },
	{ id: "orientation", label: "Orientation", description: "Prelude, /start, maintenance gate" },
	{ id: "appearance", label: "Appearance", description: "Themes, colors, fonts" },
	{ id: "workspaces", label: "Workspaces", description: "Pinned roots and display names" },
	{ id: "notifications", label: "Notifications", description: "Idle alerts and quiet hours" },
	{ id: "modelRoles", label: "Model Roles", description: "Role-specific model routing" },
	{ id: "about", label: "About", description: "Version, paths, diagnostics" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export function normalizeSection(raw: string | null): SectionId {
	return SECTIONS.some((s) => s.id === raw) ? (raw as SectionId) : "env";
}

export function sourceLabel(source: EnvEntry["source"]): string {
	if (source === "process-env") return "process env";
	if (source === "env-file") return ".env file";
	return source;
}

export function sourceTone(source: EnvEntry["source"]): "accent" | "default" | "muted" {
	if (source === "process-env") return "accent";
	if (source === "env-file") return "default";
	return "muted";
}

export function envApplyBadge(entry: EnvEntry) {
	if (entry.hotApply) return <Badge tone="success">hot</Badge>;
	if (entry.restartTarget === "telegram-bridge") return <Badge tone="warn">bridge restart</Badge>;
	if (entry.restartRequired) return <Badge tone="warn">server restart</Badge>;
	return <Badge tone="muted">manual</Badge>;
}

export function bridgeStatusTone(status: BridgeInfo["status"]): "success" | "muted" | "warn" | "danger" {
	if (status === "running") return "success";
	if (status === "starting") return "warn";
	if (status === "crashed") return "danger";
	return "muted";
}

export function bridgeStatusLabel(status: BridgeInfo["status"], info: BridgeInfo | undefined): string {
	if (status === "running") return "running";
	if (status === "starting") return "starting";
	if (status === "crashed") return info?.exitSignal ? `crashed (${info.exitSignal})` : "crashed";
	if (info && info.missingEnv.length > 0) return "missing credentials";
	return "stopped";
}

export function formatUptime(startedIso: string): string {
	const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedIso)) / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h${minutes % 60}m`;
	const days = Math.floor(hours / 24);
	return `${days}d${hours % 24}h`;
}

export function notificationLevelTone(
	level: NotificationLevel,
): "default" | "accent" | "warn" | "danger" | "success" | "muted" {
	switch (level) {
		case "info":
			return "accent";
		case "warn":
			return "warn";
		case "error":
			return "danger";
		case "critical":
			return "danger";
		default:
			return "default";
	}
}

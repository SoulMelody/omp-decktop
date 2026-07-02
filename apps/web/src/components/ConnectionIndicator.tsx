/**
 * Compact connection/session indicator for the header. Heartbeat answers
 * "can the browser still hear the deck server?"; the active session status
 * answers "is the current response still running?". The latter wins for the
 * visible label so a live turn never appears as ready just because the socket
 * is healthy.
 *
 * Dot colors:
 *   - green  : ws + heartbeat healthy, active session idle
 *   - yellow : ws healthy, but active session is working / heartbeat slow
 *   - red    : ws closed, no heartbeat, or heartbeat stale
 *
 * Hovering reveals both session state and transport metadata.
 */

import { useEffect, useState } from "react";
import { selectActiveSession, useStore } from "../lib/store";

const HEALTHY_MS = 10_000;
const WARN_MS = 20_000;

type DotColor = "green" | "yellow" | "red";
type BusyStatus = "preparing" | "streaming" | "compacting" | "retrying";

const BUSY_LABEL: Record<BusyStatus, string> = {
	preparing: "preparing",
	streaming: "streaming",
	compacting: "compacting",
	retrying: "retrying",
};

function classify(gapMs: number, hasHeartbeat: boolean): DotColor {
	if (!hasHeartbeat) return "red";
	if (gapMs < HEALTHY_MS) return "green";
	if (gapMs < WARN_MS) return "yellow";
	return "red";
}

function colorClass(color: DotColor): string {
	switch (color) {
		case "green":
			return "bg-emerald-500";
		case "yellow":
			return "bg-amber-400";
		case "red":
			return "bg-rose-500";
	}
}

function formatUptime(secs: number): string {
	if (secs < 60) return `${secs}s`;
	if (secs < 3600) return `${Math.floor(secs / 60)}m`;
	if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
	return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

export function ConnectionIndicator(): JSX.Element {
	const heartbeat = useStore((s) => s.heartbeat);
	const wsStatus = useStore((s) => s.wsStatus);
	const session = useStore(selectActiveSession);
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, []);

	const gap = heartbeat ? now - heartbeat.lastReceivedAtMs : Infinity;
	const heartbeatColor = classify(gap, heartbeat !== null);
	const busyLabel = session && session.status !== "idle" ? BUSY_LABEL[session.status] : null;
	const transportHealthy = wsStatus === "open" && heartbeatColor === "green";
	const color: DotColor = wsStatus !== "open" || heartbeatColor === "red"
		? "red"
		: busyLabel || heartbeatColor === "yellow"
			? "yellow"
			: "green";
	const label = busyLabel
		?? (color === "green"
			? "ready"
			: heartbeatColor === "yellow"
				? "slow heartbeat"
				: heartbeat === null
					? "no heartbeat yet"
					: wsStatus !== "open"
						? "disconnected"
						: "heartbeat stale");
	const transportLabel = transportHealthy ? "connected" : label;
	const gapLabel = heartbeat ? `${(gap / 1000).toFixed(1)}s` : "—";

	const tooltip = heartbeat
		? [
				`session: ${session?.status ?? "none"}`,
				`visible: ${label}`,
				`transport: ${transportLabel}`,
				`ws: ${wsStatus}`,
				`gap: ${gapLabel} since last heartbeat`,
				`server started: ${heartbeat.serverStartedAt}`,
				`uptime: ${formatUptime(heartbeat.uptimeSecs)}`,
				`version: ${heartbeat.version}`,
				heartbeat.buildSha ? `build: ${heartbeat.buildSha.slice(0, 8)}` : "build: unknown",
				`pid: ${heartbeat.pid}`,
		  ].join("\n")
		: [
				`session: ${session?.status ?? "none"}`,
				`visible: ${label}`,
				`ws: ${wsStatus}`,
				"waiting for the deck server to broadcast a heartbeat",
		  ].join("\n");

	return (
		<button
			type="button"
			title={tooltip}
			aria-label={`server ${label}`}
			className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/60"
		>
			<span
				className={`inline-block h-2 w-2 rounded-full ${colorClass(color)} ${
					color === "yellow" ? "animate-pulse" : ""
				}`}
				aria-hidden="true"
			/>
			<span className="hidden sm:inline">{label}</span>
		</button>
	);
}

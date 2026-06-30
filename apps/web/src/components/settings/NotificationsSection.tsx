import { useEffect, useMemo, useState } from "react";
import { Play, RotateCcw, X } from "lucide-react";
import type { NotificationLevel } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { playNotificationTone } from "@/lib/audio";
import { useNotificationPermission } from "@/lib/notifications";
import { useStore, type NotificationItem } from "@/lib/store";
import { cn } from "@/lib/utils";
import { notificationLevelTone, formatUptime } from "@/components/settings/settings-helpers";

/**
 * Notifications settings — surfaces the bits T-85 already plumbed:
 * browser-permission state with a request CTA, audio toggle, per-level tone
 * preview, a way to re-show the dismissed permission banner, server identity
 * pulled from the heartbeat frame, and a tail of the in-app notification log.
 */
export function NotificationsSection() {
	const {
		permission,
		requestPermission,
		audioEnabled,
		setAudioEnabled,
		bannerDismissed,
	} = useNotificationPermission();
	const heartbeat = useStore((s) => s.heartbeat);
	const notifications = useStore((s) => s.notifications);
	const dismissNotification = useStore((s) => s.dismissNotification);

	// Show the freshest notifications first; cap to keep the panel tidy.
	// We don't filter by `dismissed` here on purpose — the user dismissed
	// the toast, not the historical record.
	const recent = useMemo(
		() => notifications.slice().reverse().slice(0, 20),
		[notifications],
	);

	// Heartbeat-age clock so "5s ago" updates without re-receiving a frame.
	// Ticks only while the panel is mounted; cheap.
	const [nowMs, setNowMs] = useState(() => Date.now());
	useEffect(() => {
		const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(handle);
	}, []);

	return (
		<div className="mx-auto max-w-3xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
				<p className="mt-1 text-sm text-ink-3">
					Browser notifications and audio cues for routine failures, agent activity,
					and other server-emitted events. Settings live in this browser only.
				</p>
			</div>

			<PermissionCard
				permission={permission}
				onRequest={() => void requestPermission()}
			/>

			<AudioCard
				audioEnabled={audioEnabled}
				onToggle={setAudioEnabled}
			/>

			<BannerResetCard
				bannerDismissed={bannerDismissed}
				permission={permission}
				onReset={() => {
					try {
						localStorage.removeItem("omp-deck:notifications:banner-dismissed");
					} catch {
						/* quota / private */
					}
					// The banner component reads the flag from localStorage on mount;
					// a reload is the simplest way to re-evaluate it everywhere it's
					// rendered without threading an extra store action through.
					window.location.reload();
				}}
			/>

			<ServerIdentityCard heartbeat={heartbeat} nowMs={nowMs} />

			<RecentNotificationsCard
				items={recent}
				onDismiss={(id) => dismissNotification(id)}
			/>
		</div>
	);
}

function PermissionCard({
	permission,
	onRequest,
}: {
	permission: ReturnType<typeof useNotificationPermission>["permission"];
	onRequest: () => void;
}) {
	const tone =
		permission === "granted"
			? "success"
			: permission === "denied"
				? "danger"
				: permission === "unsupported"
					? "muted"
					: "warn";
	const label =
		permission === "granted"
			? "Granted"
			: permission === "denied"
				? "Denied"
				: permission === "unsupported"
					? "Unsupported"
					: "Not requested";

	return (
		<div className="rounded-md border border-line bg-paper-2 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="meta">Browser permission</div>
					<div className="mt-0.5 text-sm text-ink">
						OS-level notifications when the deck tab is in the background.
					</div>
				</div>
				<Badge tone={tone}>{label}</Badge>
			</div>
			<div className="mt-3 text-xs text-ink-3">
				{permission === "default" ? (
					<>
						Permission has not been requested yet. The deck will only emit OS notifications
						after you grant access.
					</>
				) : permission === "granted" ? (
					<>
						OS notifications will fire for items the server marks important
						(routine failures, long-running steps, agent task completions).
					</>
				) : permission === "denied" ? (
					<>
						The browser is blocking notifications for this site. Re-enable from the site
						settings — usually the lock icon next to the address bar — then reload.
					</>
				) : (
					<>This browser doesn't expose the Notifications API.</>
				)}
			</div>
			{permission === "default" ? (
				<div className="mt-3">
					<Button size="sm" variant="primary" onClick={onRequest}>
						Enable browser notifications
					</Button>
				</div>
			) : null}
		</div>
	);
}

function AudioCard({
	audioEnabled,
	onToggle,
}: {
	audioEnabled: boolean;
	onToggle: (enabled: boolean) => void;
}) {
	const levels: NotificationLevel[] = ["info", "warn", "error", "critical"];
	return (
		<div className="rounded-md border border-line bg-paper-2 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="meta">Audio cues</div>
					<div className="mt-0.5 text-sm text-ink">
						Synthesized tones layered on top of OS notifications. Each level has
						a distinct sequence — info is short, critical is loud.
					</div>
				</div>
				<label className="flex items-center gap-2 text-xs text-ink-2">
					<input
						type="checkbox"
						checked={audioEnabled}
						onChange={(e) => onToggle(e.target.checked)}
					/>
					<span>{audioEnabled ? "Enabled" : "Muted"}</span>
				</label>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{levels.map((level) => (
					<Button
						key={level}
						size="sm"
						variant="outline"
						disabled={!audioEnabled}
						onClick={() => void playNotificationTone(level)}
					>
						<Play className="mr-1 h-3 w-3" />
						{level}
					</Button>
				))}
			</div>
			{!audioEnabled ? (
				<div className="mt-2 text-xs text-ink-3">Enable audio to preview tones.</div>
			) : null}
		</div>
	);
}

function BannerResetCard({
	bannerDismissed,
	permission,
	onReset,
}: {
	bannerDismissed: boolean;
	permission: ReturnType<typeof useNotificationPermission>["permission"];
	onReset: () => void;
}) {
	// Banner only ever shows when permission is "default" AND not dismissed,
	// so the reset is only meaningful in that combination.
	const canReset = bannerDismissed && permission === "default";
	return (
		<div className="rounded-md border border-line bg-paper-2 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="meta">Permission banner</div>
					<div className="mt-0.5 text-sm text-ink">
						The top-of-page nudge that asks you to enable notifications.
					</div>
					<div className="mt-1 text-xs text-ink-3">
						{permission !== "default"
							? "Banner is suppressed because permission is already decided."
							: bannerDismissed
								? "You dismissed the banner. Reset to bring it back."
								: "Banner is currently visible."}
					</div>
				</div>
				<Button
					size="sm"
					variant="outline"
					disabled={!canReset}
					onClick={onReset}
				>
					<RotateCcw className="mr-1 h-3 w-3" />
					Reset banner
				</Button>
			</div>
		</div>
	);
}

function ServerIdentityCard({
	heartbeat,
	nowMs,
}: {
	heartbeat:
		| {
				lastReceivedAtMs: number;
				serverStartedAt: string;
				pid: number;
				uptimeSecs: number;
				buildSha: string | null;
				version: string;
		  }
		| null;
	nowMs: number;
}) {
	if (!heartbeat) {
		return (
			<div className="rounded-md border border-line bg-paper-2 p-4 text-xs text-ink-3">
				<div className="meta mb-1">Server identity</div>
				Waiting for the first heartbeat…
			</div>
		);
	}
	const ageMs = Math.max(0, nowMs - heartbeat.lastReceivedAtMs);
	const ageTone: "success" | "warn" | "danger" =
		ageMs < 10_000 ? "success" : ageMs < 30_000 ? "warn" : "danger";
	const ageLabel = ageMs < 1_000 ? "just now" : `${Math.round(ageMs / 1000)}s ago`;
	const shortSha = heartbeat.buildSha ? heartbeat.buildSha.slice(0, 7) : "unknown";
	return (
		<div className="rounded-md border border-line bg-paper-2 p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="meta">Server identity</div>
				<Badge tone={ageTone}>last heartbeat {ageLabel}</Badge>
			</div>
			<dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-xs text-ink-2">
				<dt className="text-ink-3">pid</dt>
				<dd>{heartbeat.pid}</dd>
				<dt className="text-ink-3">version</dt>
				<dd>{heartbeat.version}</dd>
				<dt className="text-ink-3">build</dt>
				<dd>{shortSha}</dd>
				<dt className="text-ink-3">started</dt>
				<dd>{new Date(heartbeat.serverStartedAt).toLocaleString()}</dd>
				<dt className="text-ink-3">uptime</dt>
				<dd>{formatUptime(heartbeat.serverStartedAt)}</dd>
			</dl>
		</div>
	);
}

function RecentNotificationsCard({
	items,
	onDismiss,
}: {
	items: ReadonlyArray<NotificationItem>;
	onDismiss: (id: string) => void;
}) {
	return (
		<div className="rounded-md border border-line bg-paper">
			<div className="border-b border-line bg-paper-2 px-3 py-2">
				<div className="meta">Recent activity</div>
				<div className="mt-0.5 text-xs text-ink-3">
					Latest server-emitted notifications. Capped at 50 in memory; this list
					shows the freshest 20.
				</div>
			</div>
			{items.length === 0 ? (
				<div className="px-3 py-6 text-center text-xs text-ink-3">
					No notifications yet.
				</div>
			) : (
				<ul className="divide-y divide-line">
					{items.map((item) => (
						<li
							key={item.id}
							className={cn(
								"flex items-start gap-3 px-3 py-2 text-sm",
								item.dismissed && "opacity-60",
							)}
						>
							<Badge tone={notificationLevelTone(item.level)}>{item.level}</Badge>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium text-ink">{item.title}</div>
								{item.body ? (
									<div className="mt-0.5 text-xs text-ink-2">{item.body}</div>
								) : null}
								<div className="mt-1 font-mono text-2xs text-ink-3">
									{new Date(item.timestamp).toLocaleString()}
									{item.source ? ` · ${item.source}` : ""}
								</div>
							</div>
							{!item.dismissed ? (
								<Button
									size="sm"
									variant="ghost"
									onClick={() => onDismiss(item.id)}
									aria-label="Dismiss"
									title="Dismiss"
								>
									<X className="h-3 w-3" />
								</Button>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

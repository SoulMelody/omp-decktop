import type { ClientFrame, ServerFrame } from "@omp-deck/protocol";

type Listener = (frame: ServerFrame) => void;
type StatusListener = (status: WsStatus) => void;

export type WsStatus = "connecting" | "open" | "closed";

export class WsClient {
	private socket: WebSocket | null = null;
	private listeners = new Set<Listener>();
	private statusListeners = new Set<StatusListener>();
	private queue: ClientFrame[] = [];
	private retryDelay = 500;
	private maxRetryDelay = 8000;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private status: WsStatus = "closed";
	private url: string;
	private closed = false;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	constructor(url?: string) {
		const proto = location.protocol === "https:" ? "wss" : "ws";
		if (url) {
			this.url = url;
		} else if (import.meta.env.DEV) {
			// Dev mode: bypass Vite's WS proxy. On Windows the proxy
			// drops WebSocket upgrades intermittently; connecting to
			// the server port directly is reliable.
			const port = import.meta.env.OMP_DECK_PORT ?? "8787";
			this.url = `${proto}://${location.hostname}:${port}/ws`;
		} else {
			this.url = `${proto}://${location.host}/ws`;
		}
	}

	connect(): void {
		if (this.closed) return;
		this.setStatus("connecting");
		const sock = new WebSocket(this.url);
		this.socket = sock;

		sock.addEventListener("open", () => {
			this.setStatus("open");
			this.retryDelay = 500;
			this.flushQueue();
		});

		sock.addEventListener("message", (ev) => {
			let frame: ServerFrame;
			try {
				frame = JSON.parse(ev.data) as ServerFrame;
			} catch {
				return;
			}
			for (const l of this.listeners) {
				try {
					l(frame);
				} catch (err) {
					console.warn("ws listener threw", err);
				}
			}
		});

		const onTeardown = (): void => {
			this.socket = null;
			this.setStatus("closed");
			if (!this.closed) this.scheduleReconnect();
		};
		sock.addEventListener("close", onTeardown);
		sock.addEventListener("error", () => sock.close());
	}

	/**
	 * Force-close the current socket and trigger the reconnect pipeline.
	 * Used by the heartbeat watchdog when the connection appears stale
	 * (no heartbeat for >15s) even though readyState is still OPEN.
	 */
	forceReconnect(): void {
		if (this.closed) return;
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		const sock = this.socket;
		if (sock) {
			// Close triggers onTeardown → scheduleReconnect automatically.
			try { sock.close(); } catch { /* already closed */ }
		} else {
			// No socket — connect directly.
			this.connect();
		}
	}

	dispose(): void {
		this.closed = true;
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
		this.socket?.close();
		this.socket = null;
		this.setStatus("closed");
	}

	send(frame: ClientFrame): void {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(frame));
		} else {
			this.queue.push(frame);
		}
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	onStatus(listener: StatusListener): () => void {
		this.statusListeners.add(listener);
		listener(this.status);
		return () => {
			this.statusListeners.delete(listener);
		};
	}

	getStatus(): WsStatus {
		return this.status;
	}

	/**
	 * Arm the heartbeat watchdog. If no heartbeat frame arrives within
	 * `timeoutMs`, force-close the socket and trigger reconnection.
	 * The store calls this each time it receives a heartbeat frame.
	 */
	resetHeartbeatTimer(timeoutMs: number, onTimeout: () => void): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = setInterval(() => {
			onTimeout();
		}, timeoutMs);
	}

	/** Cancel the heartbeat watchdog timer without triggering a reconnect. */
	clearHeartbeatTimer(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private setStatus(s: WsStatus): void {
		if (this.status === s) return;
		this.status = s;
		for (const l of this.statusListeners) l(s);
	}

	private flushQueue(): void {
		while (this.queue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
			const f = this.queue.shift()!;
			this.socket.send(JSON.stringify(f));
		}
	}

	private scheduleReconnect(): void {
		if (this.retryTimer) return;
		const delay = this.retryDelay;
		this.retryDelay = Math.min(this.maxRetryDelay, this.retryDelay * 2);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.connect();
		}, delay);
	}
}

import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { useStore } from "@/lib/store";

// Import xterm CSS — bundled by Vite
import "@xterm/xterm/css/xterm.css";

/**
 * Terminal panel that connects to the omp-deck server's PTY manager via
 * the existing WebSocket. Data flows bi-directionally:
 *   - keystrokes → WS "terminal_data" frame → PTY stdin
 *   - PTY stdout → WS "terminal_data" broadcast → xterm.write()
 *
 * The component mounts xterm.js into a container div, attaches the fit
 * addon to fill the panel, and subscribes to terminal frames from the WS.
 */
export function TerminalPanel() {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);

	const ws = useStore((s) => s.ws);
	const terminalReady = useStore((s) => s.terminalReady);

	// Initialize xterm once
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const term = new Terminal({
			cursorBlink: true,
			cursorStyle: "bar",
			fontSize: 13,
			fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace",
			theme: {
				background: "#0f131a", // matches slate --paper
				foreground: "#e8eaed",
				cursor: "#f97316",     // accent
				selectionBackground: "#3a3f4b",
				black: "#1c1e26",
				red: "#f44747",
				green: "#4ec9b0",
				yellow: "#f9bf3f",
				blue: "#569cd6",
				magenta: "#c586c0",
				cyan: "#9cdcfe",
				white: "#d4d4d4",
				brightBlack: "#4d4f68",
				brightRed: "#f44747",
				brightGreen: "#4ec9b0",
				brightYellow: "#f9bf3f",
				brightBlue: "#569cd6",
				brightMagenta: "#c586c0",
				brightCyan: "#9cdcfe",
				brightWhite: "#ffffff",
			},
			allowProposedApi: true,
			scrollback: 5000,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);

		// Try WebGL renderer for better performance, fall back to canvas
		try {
			const webglAddon = new WebglAddon();
			term.loadAddon(webglAddon);
			webglAddon.onContextLoss(() => {
				webglAddon.dispose();
			});
		} catch {
			// Canvas renderer is the default, no action needed
		}

		term.open(container);
		fitAddon.fit();

		termRef.current = term;
		fitRef.current = fitAddon;

		return () => {
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, []);

	// Wire terminal → WS (keystrokes outbound)
	useEffect(() => {
		const term = termRef.current;
		if (!term) return;

		const onData = (data: string) => {
			ws?.send({ type: "terminal_data", data });
		};
		const disposable = term.onData(onData);

		return () => {
			disposable.dispose();
		};
	}, [ws]);

	// Wire WS → terminal (data inbound)
	useEffect(() => {
		if (!ws) return;

		const unsub = ws.subscribe((frame) => {
			if (frame.type === "terminal_data") {
				termRef.current?.write(frame.data);
			}
		});
		return unsub;
	}, [ws]);

	// Resize xterm when the container changes size
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const observer = new ResizeObserver(() => {
			if (fitRef.current) {
				try {
					fitRef.current.fit();
					const term = termRef.current;
					if (term) {
						ws?.send({
							type: "terminal_resize",
							cols: term.cols,
							rows: term.rows,
						});
					}
				} catch {
					// fit may fail during a rapid resize; harmless
				}
			}
		});
		observer.observe(container);

		return () => observer.disconnect();
	}, [ws]);

	// Re-fit when terminalReady changes (terminal just spawned)
	const handleRefit = useCallback(() => {
		// Small delay so the DOM settles after the panel slides open
		setTimeout(() => {
			if (fitRef.current && termRef.current) {
				fitRef.current.fit();
				ws?.send({
					type: "terminal_resize",
					cols: termRef.current.cols,
					rows: termRef.current.rows,
				});
			}
		}, 50);
	}, [ws]);

	useEffect(() => {
		if (terminalReady) handleRefit();
	}, [terminalReady, handleRefit]);

	return (
		<div className="flex h-full flex-col bg-[#0f131a]">
			{!terminalReady ? (
				<div className="flex flex-1 items-center justify-center p-4 text-center font-mono text-sm text-ink-3">
					<div>
						<p className="mb-2">Terminal not running</p>
						<p className="text-xs text-ink-4">
							The server needs a PTY library installed.
						</p>
					</div>
				</div>
			) : null}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden"
				style={{ display: terminalReady ? "block" : "none" }}
			/>
		</div>
	);
}

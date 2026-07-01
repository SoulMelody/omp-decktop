import { useState, useCallback } from "react";

/** Uniform field definition for a LSP server or DAP adapter card. */
export interface ServerCardField {
	key: string;
	label: string;
	type: "text" | "json" | "toggle" | "stringList" | "select";
	placeholder?: string;
	options?: string[];
	advanced?: boolean;
}

export interface ServerCardProps {
	serverName: string;
	server: Record<string, unknown>;
	fields: ServerCardField[];
	onUpdate: (name: string, server: Record<string, unknown>) => void;
	onRemove: (name: string) => void;
}

function fieldValue(server: Record<string, unknown>, key: string): unknown {
	return server[key];
}

function setFieldValue(
	server: Record<string, unknown>,
	key: string,
	value: unknown,
): Record<string, unknown> {
	if (value === "" || value === null || value === undefined) {
		const next = { ...server };
		delete next[key];
		return next;
	}
	return { ...server, [key]: value };
}

function parseStringList(raw: string): string[] {
	return raw
		.split(/[,\n]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

export function ServerCard({ serverName, server, fields, onUpdate, onRemove }: ServerCardProps) {
	const [expanded, setExpanded] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);

	const update = useCallback(
		(key: string, value: unknown) => {
			onUpdate(serverName, setFieldValue(server, key, value));
		},
		[serverName, server, onUpdate],
	);

	const visibleFields = showAdvanced ? fields : fields.filter((f) => !f.advanced);

	return (
		<div className="rounded-md border border-line bg-paper p-3 space-y-2">
			<div className="flex items-center justify-between">
				<button
					type="button"
					className="text-xs font-mono font-semibold text-ink-2 hover:text-ink-1"
					onClick={() => setExpanded((v) => !v)}
				>
					{expanded ? "▾" : "▸"} {serverName}
				</button>
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="rounded border border-line px-1.5 py-0.5 text-2xs text-ink-3 hover:text-danger"
						onClick={() => onRemove(serverName)}
					>
						Remove
					</button>
				</div>
			</div>
			{expanded && (
				<div className="space-y-2 pl-2">
					{visibleFields.map((field) => {
						const raw = fieldValue(server, field.key);
						if (field.type === "toggle") {
							return (
								<label key={field.key} className="flex items-center gap-2 text-xs">
									<input
										type="checkbox"
										checked={Boolean(raw)}
										onChange={(e) => update(field.key, e.target.checked || null)}
									/>
									<span className="text-ink-2">{field.label}</span>
								</label>
							);
						}
						if (field.type === "select") {
							return (
								<div key={field.key} className="space-y-0.5">
									<div className="text-2xs text-ink-3">{field.label}</div>
									<select
										className="w-full rounded border border-line bg-paper-2 px-2 py-1 text-xs"
										value={String(raw ?? "")}
										onChange={(e) => update(field.key, e.target.value || null)}
									>
										<option value="">(default)</option>
										{field.options?.map((o) => (
											<option key={o} value={o}>{o}</option>
										))}
									</select>
								</div>
							);
						}
						if (field.type === "stringList") {
							const text = Array.isArray(raw) ? (raw as string[]).join(", ") : "";
							return (
								<div key={field.key} className="space-y-0.5">
									<div className="text-2xs text-ink-3">{field.label}</div>
									<input
										className="w-full rounded border border-line bg-paper-2 px-2 py-1 font-mono text-xs"
										placeholder={field.placeholder ?? ".c,.h,.cpp"}
										value={text}
										onChange={(e) => update(field.key, parseStringList(e.target.value))}
									/>
								</div>
							);
						}
						if (field.type === "json") {
							const text = raw != null ? JSON.stringify(raw, null, 2) : "";
							return (
								<div key={field.key} className="space-y-0.5">
									<div className="text-2xs text-ink-3">{field.label}</div>
									<textarea
										className="w-full rounded border border-line bg-paper-2 px-2 py-1 font-mono text-2xs"
										rows={4}
										placeholder={field.placeholder ?? "{}"}
										value={text}
										onChange={(e) => {
											try {
												const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : null;
												update(field.key, parsed);
											} catch {
												// keep stale value, user fixes JSON
											}
										}}
									/>
								</div>
							);
						}
						// default: text
						return (
							<div key={field.key} className="space-y-0.5">
								<div className="text-2xs text-ink-3">{field.label}</div>
								<input
									className="w-full rounded border border-line bg-paper-2 px-2 py-1 font-mono text-xs"
									placeholder={field.placeholder ?? ""}
									value={String(raw ?? "")}
									onChange={(e) => update(field.key, e.target.value || null)}
								/>
							</div>
						);
					})}
					{fields.some((f) => f.advanced) && (
						<button
							type="button"
							className="text-2xs text-ink-3 hover:text-ink-2"
							onClick={() => setShowAdvanced((v) => !v)}
						>
							{showAdvanced ? "Hide advanced" : "Show advanced…"}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

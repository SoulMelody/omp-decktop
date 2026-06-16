export const SETTINGS_ENV_INTRO = `<p className="mt-1 max-w-3xl text-sm text-ink-3">
					仅写入 Deck 管理的 .env 文件。来自启动进程的变量优先级更高，需要从 shell/profile 中移除后才能被覆盖。
				</p>`;

export const SETTINGS_ENV_RESTART_REQUIRED = `Restart server to apply one or more restart-required values from the managed .env.`;

export const SETTINGS_RESTART_BTN = `Restart`;

export const SETTINGS_ENV_RESTART_HINT = `Restart server to apply one or more restart-required values from the managed .env.`;

export const SETTINGS_MESSAGING_INTRO = `<p className="mt-1 text-xs text-ink-3">
					Save credentials, then start the bridge. The deck supervises the process; saving a
					credential triggers a graceful restart when the bridge is running.
				</p>`;

export const SETTINGS_MESSAGING_BOT_TOKEN = `{ label: "Bot token", entry: telegramToken }`;

export const SETTINGS_MESSAGING_ALLOWED_USERS = `{ label: "Allowed users", entry: telegramAllowed }`;

export const SETTINGS_MESSAGING_RESERVED = `Reserved for the same pattern: product-level setup here, shared managed-env storage underneath.`;

export const SETTINGS_MESSAGING_MISSING_ENV = `Missing required env:`;

export const SETTINGS_BRIDGE_LOGS = `<span>Bridge logs</span>`;

export const SETTINGS_NO_LOG_LINES = `<div className="text-ink-3">No log lines yet.</div>`;

export const SETTINGS_ENV_MODAL_WRITES_TO = `<div className="text-xs text-ink-3">Writes to managed .env only</div>`;

export const SETTINGS_ENV_MODAL_SECRET = `<Badge tone="danger">secret</Badge>`;

export const SETTINGS_ENV_MODAL_RESTART_REQUIRED = `<Badge tone="warn">restart required</Badge>`;

export const SETTINGS_ENV_MODAL_HOT_APPLY = `<Badge tone="success">hot apply</Badge>`;

export const SETTINGS_ENV_MODAL_PROCESS_ENV = `This key is currently supplied by the launching process. Replacing it here writes the
					deck-managed env file, which takes lower priority until the shell variable is removed.`;

export const SETTINGS_ENV_MODAL_NEW_VALUE = `<div className="meta mb-1">New value</div>`;

export const SETTINGS_ENV_MODAL_PLACEHOLDER_SECRET = `Paste replacement value`;

export const SETTINGS_ENV_MODAL_PLACEHOLDER_UNSET = `Unset`;

export const SETTINGS_APPEARANCE_INTRO = `<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Themes swap the entire palette and font stack at runtime. Your choice is stored in this
					browser's localStorage.
				</p>`;

export const SETTINGS_APPEARANCE_SYSTEM_PREFERENCE = `<div className="meta">System preference</div>`;

export const SETTINGS_APPEARANCE_FOLLOWING_OS = `\`Following the OS: \${theme.systemPreferred}.\``;

export const SETTINGS_APPEARANCE_PINNED = `\`Pinned to \${theme.stored}. The OS currently prefers \${theme.systemPreferred}.\``;

export const SETTINGS_APPEARANCE_MATCH_SYSTEM = `Match system`;

export const SETTINGS_APPEARANCE_FONT_PREVIEW = `<div className="meta">Font preview</div>`;

export const SETTINGS_APPEARANCE_FONT_HINT = `<div className="mt-0.5 text-xs text-ink-3">Driven by the active theme. v1 ships one font set.</div>`;

export const SETTINGS_NOTIFICATIONS_INTRO = `<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Browser notifications and audio cues for routine failures, agent activity,
					and other server-emitted events. Settings live in this browser only.
				</p>`;

export const SETTINGS_NOTIFICATIONS_BROWSER_PERMISSION = `<div className="meta">Browser permission</div>`;

export const SETTINGS_NOTIFICATIONS_NOT_REQUESTED = `"Not requested"`;

export const SETTINGS_NOTIFICATIONS_PERMISSION_DETAIL = `<p className="mt-1 text-xs text-ink-3">
						Permission has not been requested yet. The deck will only emit OS notifications
						after you explicitly grant permission.
					</p>`;

export const SETTINGS_NOTIFICATIONS_BLOCKED = `<p className="mt-1 text-xs text-ink-3">
						The browser is blocking notifications for this site. Re-enable from the site
						permissions settings in your browser.
					</p>`;

export const SETTINGS_NOTIFICATIONS_NO_API = `<>This browser doesn't expose the Notifications API.</>`;

export const SETTINGS_NOTIFICATIONS_ENABLE_BTN = `Enable browser notifications`;

export const SETTINGS_NOTIFICATIONS_AUDIO_CUES = `<div className="meta">Audio cues</div>`;

export const SETTINGS_NOTIFICATIONS_AUDIO_INTRO = `<p className="mt-1 text-xs text-ink-3">
						Synthesized tones layered on top of OS notifications. Each level has
						a distinct pitch so you can distinguish alerts without looking.
					</p>`;

export const SETTINGS_NOTIFICATIONS_ENABLE_AUDIO = `<div className="mt-2 text-xs text-ink-3">Enable audio to preview tones.</div>`;

export const SETTINGS_NOTIFICATIONS_BANNER = `<div className="meta">Permission banner</div>`;

export const SETTINGS_NOTIFICATIONS_BANNER_DESC = `<p className="mt-1 text-xs text-ink-3">
						The top-of-page nudge that asks you to enable notifications.
					</p>`;

export const SETTINGS_NOTIFICATIONS_BANNER_SUPPRESSED = `"Banner is suppressed because permission is already decided."`;

export const SETTINGS_NOTIFICATIONS_BANNER_DISMISSED = `"You dismissed the banner. Reset to bring it back."`;

export const SETTINGS_NOTIFICATIONS_BANNER_VISIBLE = `"Banner is currently visible."`;

export const SETTINGS_NOTIFICATIONS_RESET_BANNER = `Reset banner`;

export const SETTINGS_NOTIFICATIONS_SERVER_IDENTITY = `<div className="meta mb-1">Server identity</div>`;

export const SETTINGS_NOTIFICATIONS_WAITING_HEARTBEAT = `Waiting for the first heartbeat…`;

export const SETTINGS_NOTIFICATIONS_RECENT_ACTIVITY = `<div className="meta">Recent activity</div>`;

export const SETTINGS_NOTIFICATIONS_ACTIVITY_DESC = `<p className="mt-1 text-xs text-ink-3">
					Latest server-emitted notifications. Capped at 50 in memory; this list
					does not persist across server restarts.
				</p>`;

export const SETTINGS_NOTIFICATIONS_NO_NOTIFICATIONS = `<div className="text-sm text-ink-3">No notifications yet.</div>`;

export const SETTINGS_NOTIFICATIONS_ACTIVE_BADGE = `<Badge tone="accent">active</Badge>`;

export const SETTINGS_NOTIFICATIONS_PINNED_BADGE = `<Badge tone="muted">pinned</Badge>`;

export const SETTINGS_ORIENTATION_INTRO = `<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Three artifacts shape every deck session: the system-prompt prelude,
					the /start orchestrator message, and the maintenance gate that nudges the
					agent to capture work mid-session. Edit each in place; changes
					take effect on the next session.
				</p>`;

export const SETTINGS_ORIENTATION_SAVED_PRELUDE = `"Saved. New sessions will use this prelude."`;

export const SETTINGS_ORIENTATION_OVERRIDE_CLEARED = `"Override cleared. New sessions will use the bundled default."`;

export const SETTINGS_ORIENTATION_OVERRIDE_BADGE = `<Badge tone="accent">override</Badge>`;

export const SETTINGS_ORIENTATION_DEFAULT_BADGE = `<Badge tone="muted">default</Badge>`;

export const SETTINGS_ORIENTATION_PRELUDE_DESC = `Prepended to every session's system prompt at createAgentSession. Imperatives belong here, not in the /start orchestrator.`;

export const SETTINGS_ORIENTATION_UNSAVED = `<span className="font-mono text-2xs text-warn">Unsaved changes</span>`;

export const SETTINGS_START_ORCHESTRATOR = `<div className="meta">/start orchestrator</div>`;

export const SETTINGS_START_ON_DISK = `<Badge tone="default">on disk</Badge>`;

export const SETTINGS_START_MISSING = `<Badge tone="warn">missing</Badge>`;

export const SETTINGS_START_DESC = `<p className="mt-1 text-xs text-ink-3">
					First user message fired on session boot. Re-read every invocation,
					so saves take effect immediately. Numbered procedures here outrank
					prelude imperatives by recency— put DO-THIS instructions in this
					body, not in the prelude above. Toggle "Auto-start" to
					control whether /start fires automatically on every new session.
				</p>`;

export const SETTINGS_START_SAVED = `"Saved. Next /start invocation will use this body."`;

export const SETTINGS_START_PLACEHOLDER = `One-line summary (frontmatter description:)`;

export const SETTINGS_START_DESCRIPTION_LABEL = `<span className="meta">description</span>`;

export const SETTINGS_START_BODY_LABEL = `<span className="meta">body</span>`;

export const SETTINGS_MAINTENANCE_GATE = `<div className="meta">Maintenance gate</div>`;

export const SETTINGS_MAINTENANCE_DECK_PROFILE = `<Badge tone="accent">deck profile</Badge>`;

export const SETTINGS_MAINTENANCE_FLAT_FILE_PROFILE = `<Badge tone="default">flat-file profile</Badge>`;

export const SETTINGS_MAINTENANCE_INACTIVE = `<Badge tone="muted">inactive</Badge>`;

export const SETTINGS_MAINTENANCE_DESC = `<p className="mt-1 text-xs text-ink-3">
					Nudges the agent at turn_end to capture
					insights / decisions / tasks into the appropriate destination. Fires at
					most once per release segment, gated by three floors. Disabling here
					skips org-root detection so even an unaltered installed extension
					stays silent.
				</p>`;

export const SETTINGS_MAINTENANCE_ENABLED = `<span>Enabled</span>`;

export const SETTINGS_MAINTENANCE_MIN_OP_MSGS = `Operator messages since last release`;

export const SETTINGS_MAINTENANCE_MIN_RELEASE_AGE = `Wall-clock ms since last release`;

export const SETTINGS_MAINTENANCE_FIRE_FLOOR = `Wall-clock ms between fires (cross-session)`;

export const SETTINGS_MAINTENANCE_RELOAD = `Reload`;

export const SETTINGS_MAINTENANCE_EXTENSION_MISSING = `Extension not installed at expected path; knob changes won't take effect until it's restored.`;

export const SETTINGS_MAINTENANCE_REMINDER_PREVIEW = `<div className="meta">Reminder preview</div>`;

export const SETTINGS_MAINTENANCE_DECK_BTN = `deck`;

export const SETTINGS_MAINTENANCE_FLAT_FILE_BTN = `flat-file`;

export const SETTINGS_MAINTENANCE_SAVED = `"Saved. Gate will use these values on the next evaluation."`;

export const SETTINGS_MAINTENANCE_KNOB_ERROR = `"Each knob must be a positive integer or empty (to clear override)."`;

export const SETTINGS_PROVIDERS_INTRO = `<p className="mt-1 text-xs text-ink-3">
					OAuth sign-in to subscription providers (Claude Pro/Max, ChatGPT Plus/Pro, etc.).
					API keys live under <strong>Env</strong> — this surface is for browser-flow auth.
				</p>`;

export const SETTINGS_PROVIDERS_SIGN_OUT_TITLE = `Sign out of {confirmRevoke?.name}?`;

export const SETTINGS_PROVIDERS_SIGN_OUT_DESC = `<p className="text-xs text-ink-3">
						The stored credentials will be deleted from <code>auth.db</code>. Token refresh
						will fail until you log in again. Other deck instances sharing the same
						<code>OMP_AGENT_DIR</code> will lose access too.
					</p>`;

export const SETTINGS_PROVIDERS_CANCEL_BTN = `Cancel`;

export const SETTINGS_PROVIDERS_SIGN_OUT_BTN = `{revoking ? "Signing out…" : "Sign out"}`;

export const SETTINGS_PROVIDERS_OAUTH_STATE = `"OAuth (subscription)"`;

export const SETTINGS_PROVIDERS_API_KEY_STATE = `"API key configured"`;

export const SETTINGS_PROVIDERS_NOT_CONFIGURED = `"Not configured"`;

export const SETTINGS_PROVIDERS_CREDENTIALS_COUNT = `<span className="ml-1.5">· {info.count} credentials</span>`;

export const SETTINGS_PROVIDERS_LOGIN_BTN = `Login`;

export const SETTINGS_PROVIDERS_REPLACE_BTN = `Replace`;

export const SETTINGS_PROVIDERS_SIGN_OUT_ACTION = `Sign out`;

export const SETTINGS_PROVIDERS_LOGIN_REPLACES = `Login (replaces API key)`;

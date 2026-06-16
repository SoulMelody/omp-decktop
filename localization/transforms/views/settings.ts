import { injectNamedImport, replaceOne } from "../../utils/string.js";
import {
	ZH_SETTINGS_SECTIONS,
	SETTINGS_TOP_TITLE,
	SETTINGS_TOP_SUBTITLE,
	SETTINGS_LANG_BRANCH,
	SETTINGS_ENV_TITLE,
	SETTINGS_MESSAGING_TITLE,
	SETTINGS_APPEARANCE_TITLE,
	SETTINGS_NOTIFICATIONS_TITLE,
	SETTINGS_ORIENTATION_TITLE,
	SETTINGS_NOTES_TITLE,
	SETTINGS_NOTES_BODY,
	SETTINGS_SIDE_RAIL,
	SETTINGS_STUB_TITLE,
	SETTINGS_STUB_BODY,
	SETTINGS_PROVIDERS_LOADING,
	SETTINGS_PROVIDERS_META,
	LANGUAGE_SECTION_CODE,
	SETTINGS_STUB_SECTION_SIG,
} from "../../translations.js";

/**
 * Inject `const { t } = useTranslation();` right after the opening brace of
 * the given component function.  Works for both parameterless (`function X() {`)
 * and destructured-parameter signatures (`function X({ ... }) {`).
 */
function injectTranslationHook(source: string, fnName: string): string {
	const hook = `\n\tconst { t } = useTranslation();`;
	const simple = new RegExp(`function ${fnName}\\(\\) \\{`);
	if (simple.test(source)) {
		return source.replace(simple, `function ${fnName}() {${hook}`);
	}
	const multi = new RegExp(`(function ${fnName}\\([\\s\\S]*?\\) \\{)`);
	if (multi.test(source)) {
		return source.replace(multi, `$1${hook}`);
	}
	throw new Error(`injectTranslationHook: ${fnName} not found`);
}

export function localizeSettingsView(source: string): string {
	let next = injectNamedImport(source, "@/i18n/useLocale", "useLocale");
	next = injectNamedImport(next, "react-i18next", "useTranslation");
	next = replaceOne(next, /const SECTIONS = \[[\s\S]*?\] as const;/, ZH_SETTINGS_SECTIONS, "SettingsView: localized sections");
	next = replaceOne(next, '<div className="meta">Settings</div>', SETTINGS_TOP_TITLE, "SettingsView: top title");
	next = replaceOne(next, '<div className="text-xs text-ink-3">Configure this local deck instance</div>', SETTINGS_TOP_SUBTITLE, "SettingsView: top subtitle");
	next = replaceOne(
		next,
		`) : selected === "appearance" ? (
\t\t\t\t\t\t\t\t<AppearanceSection />
\t\t\t\t\t\t\t) : selected === "notifications" ? (`,
		SETTINGS_LANG_BRANCH,
		"SettingsView: language section branch",
	);
	next = replaceOne(next, '<h1 className="text-xl font-semibold tracking-tight">Environment variables</h1>', SETTINGS_ENV_TITLE, "SettingsView: env title");
	next = replaceOne(next, '<h1 className="text-xl font-semibold tracking-tight">Messaging bridges</h1>', SETTINGS_MESSAGING_TITLE, "SettingsView: messaging title");
	next = replaceOne(next, '<h1 className="text-xl font-semibold tracking-tight">Appearance</h1>', SETTINGS_APPEARANCE_TITLE, "SettingsView: appearance title");
	next = replaceOne(next, '<h1 className="text-xl font-semibold tracking-tight">Notifications</h1>', SETTINGS_NOTIFICATIONS_TITLE, "SettingsView: notifications title");
	next = replaceOne(next, '<h1 className="text-xl font-semibold tracking-tight">Orientation</h1>', SETTINGS_ORIENTATION_TITLE, "SettingsView: orientation title");
	next = replaceOne(next, '<div className="meta">Settings notes</div>', SETTINGS_NOTES_TITLE, "SettingsView: notes title");
	next = replaceOne(next, '<p>Secrets are masked in list responses. Replace values here; do not reveal unless using the loopback API directly.</p>', SETTINGS_NOTES_BODY, "SettingsView: notes body");
	next = replaceOne(next, '<div className="p-3 text-xs text-ink-3">Settings</div>', SETTINGS_SIDE_RAIL, "SettingsView: side rail");
	next = replaceOne(next, '<h1 className="mt-2 text-xl font-semibold">Not built yet</h1>', SETTINGS_STUB_TITLE, "SettingsView: stub title");
	next = replaceOne(next, '<p className="mt-1 text-sm text-ink-3">This section is reserved so the settings layout is stable.</p>', SETTINGS_STUB_BODY, "SettingsView: stub body");
	next = replaceOne(
		next,
		/if \(loading\) \{\s*return <div className="font-mono text-2xs text-ink-3">Loading providers[\s\S]*?<\/div>;\s*\}/,
		SETTINGS_PROVIDERS_LOADING,
		"SettingsView: providers loading",
	);
	next = replaceOne(next, '<h2 className="meta">Providers</h2>', SETTINGS_PROVIDERS_META, "SettingsView: providers meta");
	next = replaceOne(
		next,
		'function StubSection({ section }: { section: Exclude<SectionId, "env" | "messaging" | "appearance" | "notifications"> }) {',
		`${LANGUAGE_SECTION_CODE}\n\n${SETTINGS_STUB_SECTION_SIG}`,
		"SettingsView: insert language section",
	);

	// ── Env section ──
	next = replaceOne(
		next,
		/<p className="mt-1 max-w-3xl text-sm text-ink-3">\s*Edits write to the deck-managed env file only\. Variables from the launching process stay\s*higher priority until you remove them from that shell\/profile\.\s*<\/p>/,
		`<p className="mt-1 max-w-3xl text-sm text-ink-3">{t("settings.env.intro")}</p>`,
		"SettingsView: env intro",
	);
	next = replaceOne(
		next,
		/Restart server to apply one or more restart-required values from the managed \.env\./,
		`{t("settings.env.restartHint")}`,
		"SettingsView: env restart hint",
	);
	next = replaceOne(next, />\s*Restart\s*</, `>{t("common.actions.restart")}<`, "SettingsView: restart button");

	// ── Messaging section ──
	next = replaceOne(
		next,
		/<p className="mt-1 max-w-3xl text-sm text-ink-3">\s*Save credentials, then start the bridge\. The deck supervises the process; saving a\s*token alone does not bring the integration online\.\s*<\/p>/,
		`<p className="mt-1 max-w-3xl text-sm text-ink-3">{t("settings.messaging.intro")}</p>`,
		"SettingsView: messaging intro",
	);

	// ── Env modal ──
	next = replaceOne(next, '<div className="text-xs text-ink-3">Writes to managed .env only</div>', `<div className="text-xs text-ink-3">{t("settings.env.writesTo")}</div>`, "SettingsView: env modal writes to");
	next = replaceOne(next, '<Badge tone="danger">secret</Badge>', `<Badge tone="danger">{t("settings.env.secret")}</Badge>`, "SettingsView: env modal secret");
	next = replaceOne(next, '<Badge tone="warn">restart required</Badge>', `<Badge tone="warn">{t("settings.env.restartRequired")}</Badge>`, "SettingsView: env modal restart required");
	next = replaceOne(next, '<Badge tone="success">hot apply</Badge>', `<Badge tone="success">{t("settings.env.hotApply")}</Badge>`, "SettingsView: env modal hot apply");
	next = replaceOne(
		next,
		/This key is currently supplied by the launching process\. Replacing it here writes the\s*managed env file, but process env remains higher priority until removed upstream\./,
		`{t("settings.env.processEnv")}`,
		"SettingsView: env modal process env",
	);
	next = replaceOne(next, '<div className="meta mb-1">New value</div>', `<div className="meta mb-1">{t("settings.env.newValue")}</div>`, "SettingsView: env modal new value");
	next = replaceOne(next, 'placeholder={entry.sensitive ? "Paste replacement value" : entry.defaultValue ?? "Unset"}', `placeholder={entry.sensitive ? t("settings.env.pasteValue") : entry.defaultValue ?? t("settings.env.unset")}`, "SettingsView: env modal placeholder");

	// ── Appearance section ──
	next = replaceOne(
		next,
		/<p className="mt-1 max-w-3xl text-sm text-ink-3">\s*Themes swap the entire palette and font stack at runtime\. Your choice is stored in this\s*browser; clearing it falls back to the system color preference\.\s*<\/p>/,
		`<p className="mt-1 max-w-3xl text-sm text-ink-3">{t("settings.appearance.intro")}</p>`,
		"SettingsView: appearance intro",
	);
	next = replaceOne(next, '<div className="meta">System preference</div>', `<div className="meta">{t("settings.appearance.systemPreference")}</div>`, "SettingsView: appearance system preference");
	next = replaceOne(next, '<div className="meta">Font preview</div>', `<div className="meta">{t("settings.appearance.fontPreview")}</div>`, "SettingsView: appearance font preview");
	next = replaceOne(next, '<div className="mt-0.5 text-xs text-ink-3">Driven by the active theme. v1 ships one font set.</div>', `<div className="mt-0.5 text-xs text-ink-3">{t("settings.appearance.fontHint")}</div>`, "SettingsView: appearance font hint");

	// ── Notifications section ──
	next = replaceOne(
		next,
		/<p className="mt-1 text-sm text-ink-3">\s*Browser notifications and audio cues for routine failures, agent activity,\s*and other server-emitted events\. Settings live in this browser only\.\s*<\/p>/,
		`<p className="mt-1 text-sm text-ink-3">{t("settings.notifications.intro")}</p>`,
		"SettingsView: notifications intro",
	);
	next = replaceOne(next, '<div className="meta">Browser permission</div>', `<div className="meta">{t("settings.notifications.browserPermission")}</div>`, "SettingsView: notifications browser permission");
	next = replaceOne(next, '"Not requested";', `t("settings.notifications.notRequested");`, "SettingsView: notifications not requested");
	next = replaceOne(
		next,
		/Permission has not been requested yet\. The deck will only emit OS notifications\s*after you grant access\./,
		`{t("settings.notifications.permissionDetail")}`,
		"SettingsView: notifications permission detail",
	);
	next = replaceOne(
		next,
		/The browser is blocking notifications for this site\. Re-enable from the site\s*settings — usually the lock icon next to the address bar — then reload\./,
		`{t("settings.notifications.blocked")}`,
		"SettingsView: notifications blocked",
	);
	next = replaceOne(next, '<>This browser doesn\'t expose the Notifications API.</>', `<>{t("settings.notifications.noApi")}</>`, "SettingsView: notifications no api");
	next = replaceOne(next, 'Enable browser notifications', `{t("settings.notifications.enableBrowserNotifications")}`, "SettingsView: notifications enable btn");
	next = replaceOne(next, '<div className="meta">Audio cues</div>', `<div className="meta">{t("settings.notifications.audioCues")}</div>`, "SettingsView: notifications audio cues");
	next = replaceOne(
		next,
		/Synthesized tones layered on top of OS notifications\. Each level has\s*a distinct sequence — info is short, critical is loud\./,
		`{t("settings.notifications.audioIntro")}`,
		"SettingsView: notifications audio intro",
	);
	next = replaceOne(next, '<div className="mt-2 text-xs text-ink-3">Enable audio to preview tones.</div>', `<div className="mt-2 text-xs text-ink-3">{t("settings.notifications.enableAudio")}</div>`, "SettingsView: notifications enable audio");
	next = replaceOne(next, '<div className="meta">Permission banner</div>', `<div className="meta">{t("settings.notifications.permissionBanner")}</div>`, "SettingsView: notifications banner");
	next = replaceOne(
		next,
		/The top-of-page nudge that asks you to enable notifications\./,
		`{t("settings.notifications.bannerDesc")}`,
		"SettingsView: notifications banner desc",
	);
	next = replaceOne(next, '"Banner is suppressed because permission is already decided."', `t("settings.notifications.bannerSuppressed")`, "SettingsView: notifications banner suppressed");
	next = replaceOne(next, '"You dismissed the banner. Reset to bring it back."', `t("settings.notifications.bannerDismissed")`, "SettingsView: notifications banner dismissed");
	next = replaceOne(next, '"Banner is currently visible."', `t("settings.notifications.bannerVisible")`, "SettingsView: notifications banner visible");
	next = replaceOne(next, 'Reset banner', `{t("settings.notifications.resetBanner")}`, "SettingsView: notifications reset banner");
	next = replaceOne(next, '<div className="meta mb-1">Server identity</div>', `<div className="meta mb-1">{t("settings.notifications.serverIdentity")}</div>`, "SettingsView: notifications server identity");
	next = replaceOne(next, 'Waiting for the first heartbeat…', `{t("settings.notifications.waitingHeartbeat")}`, "SettingsView: notifications waiting heartbeat");
	next = replaceOne(next, '<div className="meta">Recent activity</div>', `<div className="meta">{t("settings.notifications.recentActivity")}</div>`, "SettingsView: notifications recent activity");
	next = replaceOne(
		next,
		/Latest server-emitted notifications\. Capped at 50 in memory; this list\s*shows the freshest 20\./,
		`{t("settings.notifications.activityDesc")}`,
		"SettingsView: notifications activity desc",
	);
	next = replaceOne(next, 'No notifications yet.', `{t("settings.notifications.noNotifications")}`, "SettingsView: notifications no notifications");
	next = replaceOne(next, '<Badge tone="accent">active</Badge>', `<Badge tone="accent">{t("settings.notifications.active")}</Badge>`, "SettingsView: notifications active badge");
	next = replaceOne(next, '<Badge tone="muted">pinned</Badge>', `<Badge tone="muted">{t("settings.notifications.pinned")}</Badge>`, "SettingsView: notifications pinned badge");

	// ── Orientation section ──
	next = replaceOne(
		next,
		/Three artifacts shape every deck session: the system-prompt prelude,/,
		`{t("settings.orientation.intro")}`,
		"SettingsView: orientation intro",
	);
	next = replaceOne(next, '"Saved. New sessions will use this prelude."', `t("settings.orientation.savedPrelude")`, "SettingsView: orientation saved prelude");
	next = replaceOne(next, '"Override cleared. New sessions will use the bundled default."', `t("settings.orientation.overrideCleared")`, "SettingsView: orientation override cleared");
	next = replaceOne(next, '<Badge tone="accent">override</Badge>', `<Badge tone="accent">{t("settings.orientation.override")}</Badge>`, "SettingsView: orientation override badge");
	next = replaceOne(next, '<Badge tone="muted">default</Badge>', `<Badge tone="muted">{t("settings.orientation.default")}</Badge>`, "SettingsView: orientation default badge");
	next = replaceOne(
		next,
		/Prepended to every session&rsquo;s system prompt at\{" "\}\s*<code className="font-mono">createAgentSession<\/code>\. Imperatives belong\s*in <code className="font-mono">\/start<\/code>, not here&mdash; the prelude\s*is reference material that the orchestrator can rely on\./,
		`{t("settings.orientation.preludeDesc")}`,
		"SettingsView: orientation prelude desc",
	);
	next = replaceOne(next, '<span className="font-mono text-2xs text-warn">Unsaved changes</span>', `<span className="font-mono text-2xs text-warn">{t("settings.orientation.unsaved")}</span>`, "SettingsView: orientation unsaved");

	// ── Start command ──
	next = replaceOne(next, '<div className="meta">/start orchestrator</div>', `<div className="meta">{t("settings.startOrchestrator.title")}</div>`, "SettingsView: start orchestrator");
	next = replaceOne(next, '<Badge tone="default">on disk</Badge>', `<Badge tone="default">{t("settings.startOrchestrator.onDisk")}</Badge>`, "SettingsView: start on disk");
	next = replaceOne(next, '<Badge tone="warn">missing</Badge>', `<Badge tone="warn">{t("settings.startOrchestrator.missing")}</Badge>`, "SettingsView: start missing");
	next = replaceOne(
		next,
		/<p className="mt-1 text-xs text-ink-3">\s*First user message fired on session boot\. Re-read every invocation,\s*so saves take effect immediately\. Numbered procedures here outrank\s*prelude imperatives by recency&mdash;put DO-THIS instructions in this\s*body, not in the prelude above\. Toggle &ldquo;Auto-start&rdquo; to\s*control whether <code className="font-mono">\/start<\/code> fires\s*automatically on every new session\.\s*<\/p>/,
		`<p className="mt-1 text-xs text-ink-3">{t("settings.startOrchestrator.desc")}</p>`,
		"SettingsView: start desc",
	);
	next = replaceOne(next, '"Saved. Next /start invocation will use this body."', `t("settings.startOrchestrator.saved")`, "SettingsView: start saved");
	next = replaceOne(next, 'placeholder="One-line summary (frontmatter description:)"', `placeholder={t("settings.startOrchestrator.placeholder")}`, "SettingsView: start placeholder");
	next = replaceOne(next, '<span className="meta">description</span>', `<span className="meta">{t("settings.startOrchestrator.descriptionLabel")}</span>`, "SettingsView: start description label");
	next = replaceOne(next, '<span className="meta">body</span>', `<span className="meta">{t("settings.startOrchestrator.bodyLabel")}</span>`, "SettingsView: start body label");
	next = replaceOne(next, '<span>Auto-start on new session</span>', `<span>{t("settings.startOrchestrator.autoStart")}</span>`, "SettingsView: start auto-start label");

	// ── Maintenance gate ──
	next = replaceOne(next, '<div className="meta">Maintenance gate</div>', `<div className="meta">{t("settings.maintenance.gate")}</div>`, "SettingsView: maintenance gate");
	next = replaceOne(next, '<Badge tone="accent">deck profile</Badge>', `<Badge tone="accent">{t("settings.maintenance.deckProfile")}</Badge>`, "SettingsView: maintenance deck profile");
	next = replaceOne(next, '<Badge tone="default">flat-file profile</Badge>', `<Badge tone="default">{t("settings.maintenance.flatFileProfile")}</Badge>`, "SettingsView: maintenance flat-file profile");
	next = replaceOne(next, '<Badge tone="muted">inactive</Badge>', `<Badge tone="muted">{t("settings.maintenance.inactive")}</Badge>`, "SettingsView: maintenance inactive");
	next = replaceOne(
		next,
		/<p className="mt-1 text-xs text-ink-3">\s*Nudges the agent at <code className="font-mono">turn_end<\/code> to capture\s*insights \/ decisions \/ tasks into the appropriate destination\. Fires at\s*most once per release segment, gated by three floors\. Disabling here\s*skips org-root detection so even an unaltered installed extension\s*stays silent\.\s*<\/p>/,
		`<p className="mt-1 text-xs text-ink-3">{t("settings.maintenance.desc")}</p>`,
		"SettingsView: maintenance desc",
	);
	next = replaceOne(next, '<span>Enabled</span>', `<span>{t("settings.maintenance.enabled")}</span>`, "SettingsView: maintenance enabled");
	next = replaceOne(next, 'help="Operator messages since last release"', `help={t("settings.maintenance.minOpMsgs")}`, "SettingsView: maintenance min op msgs");
	next = replaceOne(next, 'help="Wall-clock ms since last release"', `help={t("settings.maintenance.minReleaseAge")}`, "SettingsView: maintenance min release age");
	next = replaceOne(next, 'help="Wall-clock ms between fires (cross-session)"', `help={t("settings.maintenance.fireFloor")}`, "SettingsView: maintenance fire floor");
	next = replaceOne(
		next,
		/Extension not installed at expected path; knob changes won&rsquo;t take effect until\s*it&rsquo;s restored\./,
		`{t("settings.maintenance.extensionMissing")}`,
		"SettingsView: maintenance extension missing",
	);
	next = replaceOne(next, '<div className="meta">Reminder preview</div>', `<div className="meta">{t("settings.maintenance.reminderPreview")}</div>`, "SettingsView: maintenance reminder preview");
	next = replaceOne(next, '"Saved. Gate will use these values on the next evaluation."', `t("settings.maintenance.saved")`, "SettingsView: maintenance saved");
	next = replaceOne(next, '"Each knob must be a positive integer or empty (to clear override)."', `t("settings.maintenance.knobError")`, "SettingsView: maintenance knob error");

	// ── Providers section ──
	next = replaceOne(
		next,
		/<p className="mt-1 text-xs text-ink-3">\s*OAuth sign-in to subscription providers \(Claude Pro\/Max, ChatGPT Plus\/Pro, etc\.\)\.\s*API keys live under <strong>Env<\/strong> — this surface is for browser-flow auth\.\s*<\/p>/,
		`<p className="mt-1 text-xs text-ink-3">{t("settings.providers.intro")}</p>`,
		"SettingsView: providers intro",
	);
	next = replaceOne(next, 'Sign out of {confirmRevoke?.name}?', `{t("settings.providers.signOutOf")} {confirmRevoke?.name}?`, "SettingsView: providers sign out title");
	next = replaceOne(
		next,
		/<p className="text-xs text-ink-3">\s*The stored credentials will be deleted from <code>auth\.db<\/code>\. Token refresh\s*will fail until you log in again\. Other deck instances sharing the same\s*<code>OMP_AGENT_DIR<\/code> will lose access too\.\s*<\/p>/,
		`<p className="text-xs text-ink-3">{t("settings.providers.signOutDesc")}</p>`,
		"SettingsView: providers sign out desc",
	);
	next = replaceOne(next, 'Cancel', `{t("common.actions.cancel")}`, "SettingsView: providers cancel btn");
	next = replaceOne(next, '"Signing out…"', `t("settings.providers.signingOut")`, "SettingsView: providers signing out");
	next = replaceOne(next, '"Sign out"', `t("settings.providers.signOut")`, "SettingsView: providers sign out btn");
	next = replaceOne(next, '"OAuth (subscription)"', `t("settings.providers.oauthState")`, "SettingsView: providers oauth state");
	next = replaceOne(next, '"API key configured"', `t("settings.providers.apiKeyState")`, "SettingsView: providers api key state");
	next = replaceOne(next, '"Not configured"', `t("settings.providers.notConfigured")`, "SettingsView: providers not configured");
	next = replaceOne(next, '<span className="ml-1.5">· {info.count} credentials</span>', `<span className="ml-1.5">· {info.count} {t("settings.providers.credentialsCount")}</span>`, "SettingsView: providers credentials count");
	next = replaceOne(next, 'Login', `{t("settings.providers.login")}`, "SettingsView: providers login btn");
	next = replaceOne(next, 'Replace', `{t("settings.providers.replace")}`, "SettingsView: providers replace btn");
	next = replaceOne(next, 'Sign out', `{t("settings.providers.signOut")}`, "SettingsView: providers sign out action");
	next = replaceOne(next, 'Login (replaces API key)', `{t("settings.providers.loginReplaces")}`, "SettingsView: providers login replaces");

	// ── Inject useTranslation hook into every component that uses t() ──
	const hookComponents = [
		"EnvSection",
		"MessagingSection",
		"MessagingCredentialRow",
		"EditEnvModal",
		"AppearanceSection",
		"NotificationsSection",
		"PermissionCard",
		"AudioCard",
		"BannerResetCard",
		"ServerIdentityCard",
		"RecentNotificationsCard",
		"ThemeCard",
		"OrientationSection",
		"PreludeCard",
		"StartCommandCard",
		"MaintenanceGateCard",
		"ProvidersSection",
		"ProviderCard",
	];
	for (const fn of hookComponents) {
		next = injectTranslationHook(next, fn);
	}

	return next;
}

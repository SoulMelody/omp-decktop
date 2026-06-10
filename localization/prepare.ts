import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	ADD_MARKETPLACE_MODAL_HOOK,
	DETECT_LOCALE_FN,
	EMPTY_SOURCES_HOOK,
	ENTRY_CARD_HOOK,
	INBOX_COMPOSE_BODY_PLACEHOLDER,
	INBOX_COMPOSE_CANCEL,
	INBOX_COMPOSE_CAPTURE,
	INBOX_COMPOSE_HOOK,
	INBOX_COMPOSE_KIND_OPTION,
	INBOX_COMPOSE_SAVE_HINT,
	INBOX_COMPOSE_TITLE_PLACEHOLDER,
	INBOX_EMPTY_ALL,
	INBOX_EMPTY_READER_CAPTURE,
	INBOX_EMPTY_READER_DETAIL,
	INBOX_EMPTY_READER_HOOK,
	INBOX_HEADER_ALL,
	INBOX_KIND_LABEL,
	INBOX_LIST_ROW_ARIA,
	INBOX_LIST_ROW_HOOK,
	INBOX_LOADING,
	INBOX_READER_ADD_NOTES,
	INBOX_READER_CLOSE_LABEL,
	INBOX_READER_DELETE_LABEL,
	INBOX_READER_HOOK,
	INBOX_READER_KIND_OPTION,
	INBOX_READER_MARK_LABEL,
	INBOX_READER_OPEN_IN_CHAT,
	INBOX_READER_OPEN_IN_CHAT_HINT,
	INBOX_READER_PROMOTE_LABEL,
	INBOX_READER_UNTITLED,
	INBOX_SIDEBAR_CAPTURE,
	INBOX_SIDEBAR_FILTER,
	INBOX_SIDEBAR_HOOK,
	INBOX_SIDEBAR_KIND_LABEL,
	INBOX_SIDEBAR_SHOW_PROCESSED,
	INBOX_VIEW_HOOK,
	LANGUAGE_SECTION_CODE,
	LAYOUT_CLOSE_ARIA,
	LAYOUT_CLOSE_PANELS_ARIA,
	LAYOUT_HOOK,
	LAYOUT_INSPECTOR_LABEL,
	LAYOUT_MOBILE_CLOSE_HOOK,
	LAYOUT_TOGGLE_INSP_ARIA,
	LAYOUT_TOGGLE_INSP_TITLE,
	LAYOUT_TOGGLE_SESS_ARIA,
	LAYOUT_TOGGLE_SESS_TITLE,
	LAYOUT_TOOL_CARDS_ARIA,
	LAYOUT_TOOL_CARDS_HOOK,
	LAYOUT_TOOL_CARDS_TITLE,
	MARKETPLACE_ADD_BTN,
	MARKETPLACE_ADD_MARKETPLACE_MODAL_TITLE,
	MARKETPLACE_ADD_TITLE,
	MARKETPLACE_ALL_LABEL,
	MARKETPLACE_ALL_MARKETPLACES,
	MARKETPLACE_AVAILABLE_LABEL,
	MARKETPLACE_CANCEL,
	MARKETPLACE_CATALOG_LABEL,
	MARKETPLACE_CATALOG_LOADING,
	MARKETPLACE_INSTALLED_BADGE,
	MARKETPLACE_INSTALLED_LABEL,
	MARKETPLACE_INSPECTOR_HOOK,
	MARKETPLACE_INSTALL_BTN,
	MARKETPLACE_LOADING,
	MARKETPLACE_NO_MARKETPLACES,
	MARKETPLACE_NO_MARKETPLACES_HINT,
	MARKETPLACE_NO_MATCHES,
	MARKETPLACE_PLUGIN_DETAILS,
	MARKETPLACE_PLUGIN_DETAILS_HINT,
	MARKETPLACE_REFRESH_TITLE,
	MARKETPLACE_SEARCH_PLACEHOLDER,
	MARKETPLACE_SIDEBAR_HOOK,
	MARKETPLACE_SOURCES_LABEL,
	MARKETPLACE_SUGGESTED,
	MARKETPLACE_TITLE,
	MARKETPLACE_UNINSTALL_TITLE,
	MARKETPLACE_VIEW_HOOK,
	NAV_RAIL_HOOK,
	NAV_RAIL_ITEMS,
	NAV_RAIL_LABEL,
	NAV_RAIL_SETTINGS_ARIA,
	NAV_RAIL_SETTINGS_TITLE,
	NOTIFICATION_BANNER_BLOCKED,
	NOTIFICATION_BANNER_DISMISS,
	NOTIFICATION_BANNER_ENABLE,
	NOTIFICATION_BANNER_HOOK,
	NOTIFICATION_BANNER_NOT_NOW,
	NOTIFICATION_BANNER_PROMPT,
	NOTIFICATION_TOAST_DISMISS_ARIA,
	NOTIFICATION_TOAST_HOOK,
	NOTIFICATION_TOAST_VIEW,
	SETTINGS_APPEARANCE_TITLE,
	SETTINGS_ENV_TITLE,
	SETTINGS_LANG_BRANCH,
	SETTINGS_MESSAGING_TITLE,
	SETTINGS_NOTES_BODY,
	SETTINGS_NOTES_TITLE,
	SETTINGS_NOTIFICATIONS_TITLE,
	SETTINGS_ORIENTATION_TITLE,
	SETTINGS_PROVIDERS_LOADING,
	SETTINGS_PROVIDERS_META,
	SETTINGS_SIDE_RAIL,
	SETTINGS_STUB_BODY,
	SETTINGS_STUB_SECTION_SIG,
	SETTINGS_STUB_TITLE,
	SETTINGS_TOP_SUBTITLE,
	SETTINGS_TOP_TITLE,
	SIDEBAR_ALL_WS_OPTION,
	SIDEBAR_HOOK,
	SIDEBAR_LIVE_ARIA,
	SIDEBAR_NEW_SESSION,
	SIDEBAR_NO_SESSIONS,
	SIDEBAR_PLAN_MODE_TITLE,
	SIDEBAR_REFRESH_SESS_ARIA,
	SIDEBAR_REFRESH_WS_ARIA,
	SIDEBAR_SESSION_ROW_HOOK,
	SIDEBAR_SESSIONS_SUMMARY,
	SIDEBAR_WORKSPACE_LABEL,
	TASKS_COLUMNS_BTN,
	TASKS_EDIT_COLUMNS_TITLE,
	TASKS_EMPTY_INSPECTOR_HOOK,
	TASKS_EMPTY_INSPECTOR_TEXT,
	TASKS_HOOK,
	TASKS_LOADING,
	TASKS_NO_COLUMNS,
	TASKS_OVERVIEW,
	TASKS_SIDEBAR_HOOK,
	TASKS_TASK_COUNT,
	TASKS_TIP1,
	TASKS_TIP2,
	TASKS_TIP3,
	TASKS_TIPS,
	TASKS_TITLE,
	ZH_SETTINGS_SECTIONS,
	ROUTINES_ALL_ROUTINES,
	ROUTINES_CREATE_LABEL,
	ROUTINES_CRON_LABEL,
	EDITOR_SIDEBAR_HOOK,
	INDEX_INSPECTOR_HOOK,
	ROUTINES_EDITOR_LABEL,
	ROUTINES_EDITOR_NOTE,
	ROUTINES_ENABLE_DISABLE_TITLE,
	ROUTINES_INDEX_HOOK,
	ROUTINES_LAST,
	ROUTINES_LOADING,
	ROUTINES_LOADING_ROUTINE,
	ROUTINES_MANUAL,
	ROUTINES_NEW_ROUTINE,
	ROUTINES_NEXT,
	ROUTINES_NEXT_FIRE_LABEL,
	ROUTINES_NO_ENABLED_SCHEDULES,
	ROUTINES_NO_ROUTINES,
	ROUTINES_NO_ROUTINES_HINT,
	ROUTINES_NO_TEMPLATES,
	ROUTINES_ON_OFF,
	ROUTINES_OVERVIEW_LABEL,
	ROUTINES_PERCENT_OK,
	ROUTINES_PIPELINE_CHIP,
	ROUTINES_RUNS_RECORDED,
	ROUTINES_RUN_BTN,
	ROUTINES_RUN_NOW_TITLE,
	ROUTINES_SCHEDULE_LABEL,
	ROUTINES_SIDEBAR_HOOK,
	ROUTINES_STAT_DISABLED,
	ROUTINES_STAT_ENABLED,
	ROUTINES_STAT_PIPELINES,
	ROUTINES_STEPS,
	ROUTINES_SUMMARY,
	ROUTINES_TEMPLATES_LABEL,
	ROUTINES_TEMPLATES_LOADING,
	ROUTINES_TEMPLATE_MAP,
	ROUTINES_TEMPLATE_STEPS_TRIGGERS,
	ROUTINES_TITLE,
	ROUTINES_TOTAL_ROUTINES,
	ROUTINES_VIEW_HOOK,
	ROUTINE_LIST_ITEM_HOOK,
} from "./translations.js";

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, "apps", "web");
const generatedRoot = path.join(repoRoot, ".generated", "web-root-i18n");
const generatedSrc = path.join(generatedRoot, "src");

async function main(): Promise<void> {
	await rm(generatedRoot, { recursive: true, force: true });
	await mkdir(generatedRoot, { recursive: true });
	await symlink(path.join(webRoot, "node_modules"), path.join(generatedRoot, "node_modules"), "junction");

	await cp(path.join(webRoot, "public"), path.join(generatedRoot, "public"), { recursive: true });
	await cp(path.join(webRoot, "src"), generatedSrc, { recursive: true });

	await rewriteGeneratedStyles();
	await localizeGeneratedFiles();
	await writeLocalizedIndexHtml();
	await writeLocalizedMain();
}

async function rewriteGeneratedStyles(): Promise<void> {
	const stylesPath = path.join(generatedSrc, "styles.css");
	const source = await readFile(stylesPath, "utf8");
	const rewritten = source
		.replaceAll('@import "@fontsource/', '@import "../../../apps/web/node_modules/@fontsource/')
		.replaceAll('@import "highlight.js/', '@import "../../../apps/web/node_modules/highlight.js/');
	await writeFile(stylesPath, rewritten, "utf8");
}

async function localizeGeneratedFiles(): Promise<void> {
	await transformGeneratedFile(path.join("components", "NavRail.tsx"), localizeNavRail);
	await transformGeneratedFile(path.join("components", "Sidebar.tsx"), localizeSidebar);
	await transformGeneratedFile(
		path.join("components", "NotificationPermissionBanner.tsx"),
		localizeNotificationPermissionBanner,
	);
	await transformGeneratedFile(path.join("components", "NotificationToast.tsx"), localizeNotificationToast);
	await transformGeneratedFile(path.join("components", "Layout.tsx"), localizeLayout);
	await transformGeneratedFile(path.join("i18n", "index.ts"), localizeI18nIndex);
	await transformGeneratedFile(path.join("views", "SettingsView.tsx"), localizeSettingsView);
	await transformGeneratedFile(path.join("views", "SkillsView.tsx"), localizeSkillsView);
	await transformGeneratedFile(path.join("views", "TasksView.tsx"), localizeTasksView);
	await transformGeneratedFile(path.join("views", "InboxView.tsx"), localizeInboxView);
	await transformGeneratedFile(path.join("views", "RoutinesView.tsx"), localizeRoutinesView);
	await transformGeneratedFile(path.join("views", "MarketplaceView.tsx"), localizeMarketplaceView);
	await transformGeneratedFile(path.join("views", "KbView.tsx"), localizeKbView);
	await transformGeneratedFile(path.join("views", "IntegrationsView.tsx"), localizeIntegrationsView);
	await transformGeneratedFile(path.join("views", "OnboardingView.tsx"), localizeOnboardingView);
}

async function transformGeneratedFile(relPath: string, transform: (source: string) => string): Promise<void> {
	const fullPath = path.join(generatedSrc, relPath);
	const source = await readFile(fullPath, "utf8");
	const normalized = source.replace(/\r\n/g, "\n");
	await writeFile(fullPath, transform(normalized), "utf8");
}

async function writeLocalizedIndexHtml(): Promise<void> {
	const indexHtml = await readFile(path.join(webRoot, "index.html"), "utf8");
	await writeFile(
		path.join(generatedRoot, "index.html"),
		indexHtml.replace('/src/main.tsx', '/src/main.zh.tsx'),
		"utf8",
	);
}

async function writeLocalizedMain(): Promise<void> {
	const mainSource = await readFile(path.join(webRoot, "src", "main.tsx"), "utf8");
	const localizedMain = mainSource.includes('./i18n"') || mainSource.includes("./i18n'")
		? mainSource
		: mainSource.replace('import "./styles.css";', 'import "./styles.css";\nimport "./i18n";');
	await writeFile(path.join(generatedSrc, "main.zh.tsx"), localizedMain, "utf8");
}

function localizeNavRail(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(next, /const ITEMS: ReadonlyArray<\{[\s\S]*?\n\];/, NAV_RAIL_ITEMS, "NavRail: items config");
	next = replaceOne(next, /export function NavRail\(\) \{\s*return \(/, NAV_RAIL_HOOK, "NavRail: inject translation hook");
	next = replaceOne(next, "item.label", NAV_RAIL_LABEL, "NavRail: item label usage");
	next = replaceOne(next, 'title="Settings"', NAV_RAIL_SETTINGS_TITLE, "NavRail: settings title");
	next = replaceOne(next, 'aria-label="Settings"', NAV_RAIL_SETTINGS_ARIA, "NavRail: settings aria");
	return next;
}

function localizeSidebar(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(
		next,
		/export function Sidebar\(\) \{\s*const workspaces = useStore\(\(s\) => s\.workspaces\);/,
		SIDEBAR_HOOK,
		"Sidebar: inject root translation hook",
	);
	next = replaceOne(next, '<div className="meta">Workspace</div>', SIDEBAR_WORKSPACE_LABEL, "Sidebar: workspace label");
	next = replaceOne(next, 'aria-label="Refresh workspaces"', SIDEBAR_REFRESH_WS_ARIA, "Sidebar: refresh workspaces");
	next = replaceOne(next, '<option value="">(all workspaces)</option>', SIDEBAR_ALL_WS_OPTION, "Sidebar: all workspaces option");
	next = replaceOne(next, />\s*New session\s*</, SIDEBAR_NEW_SESSION, "Sidebar: new session button");
	next = replaceOne(
		next,
		/<div className="meta">Sessions[\s\S]*?\{filtered\.length\}<\/div>/,
		SIDEBAR_SESSIONS_SUMMARY,
		"Sidebar: sessions summary",
	);
	next = replaceOne(next, 'aria-label="Refresh sessions"', SIDEBAR_REFRESH_SESS_ARIA, "Sidebar: refresh sessions");
	next = replaceOne(next, />\s*No sessions yet\.\s*</, SIDEBAR_NO_SESSIONS, "Sidebar: empty state");
	next = replaceOne(
		next,
		/onClick: \(\) => void;\n\}\) \{\n\treturn \(/,
		SIDEBAR_SESSION_ROW_HOOK,
		"Sidebar: inject SessionRow translation hook",
	);
	next = replaceOne(next, 'aria-label="live"', SIDEBAR_LIVE_ARIA, "Sidebar: live status");
	next = replaceOne(next, 'title="Plan mode active"', SIDEBAR_PLAN_MODE_TITLE, "Sidebar: plan mode title");
	return next;
}

function localizeNotificationPermissionBanner(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(
		next,
		/export function NotificationPermissionBanner\(\): JSX\.Element \| null \{\s*const \{ permission, requestPermission, bannerDismissed, dismissBanner \} = useNotificationPermission\(\);/,
		NOTIFICATION_BANNER_HOOK,
		"NotificationPermissionBanner: inject translation hook",
	);
	next = replaceOne(
		next,
		/<span>\s*OS notifications are blocked\.[\s\S]*?<\/span>/,
		NOTIFICATION_BANNER_BLOCKED,
		"NotificationPermissionBanner: blocked copy",
	);
	next = replaceOne(next, />\s*Dismiss\s*</, NOTIFICATION_BANNER_DISMISS, "NotificationPermissionBanner: dismiss button");
	next = replaceOne(
		next,
		/<span>\s*Enable browser notifications so the deck can ping you when a routine fails or needs attention\.\s*<\/span>/,
		NOTIFICATION_BANNER_PROMPT,
		"NotificationPermissionBanner: prompt copy",
	);
	next = replaceOne(next, />\s*Enable notifications\s*</, NOTIFICATION_BANNER_ENABLE, "NotificationPermissionBanner: enable button");
	next = replaceOne(next, />\s*Not now\s*</, NOTIFICATION_BANNER_NOT_NOW, "NotificationPermissionBanner: not now button");
	return next;
}

function localizeNotificationToast(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(
		next,
		/export function NotificationToast\(\): JSX\.Element \| null \{\s*const notifications = useStore\(\(s\) => s\.notifications\);/,
		NOTIFICATION_TOAST_HOOK,
		"NotificationToast: inject translation hook",
	);
	next = replaceOne(next, />\s*View\s*</, NOTIFICATION_TOAST_VIEW, "NotificationToast: view action");
	next = replaceOne(next, 'aria-label="Dismiss notification"', NOTIFICATION_TOAST_DISMISS_ARIA, "NotificationToast: dismiss aria");
	return next;
}

function localizeLayout(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(
		next,
		/export function Layout\(\{ sidebar, main, inspector, topBar \}: Props\) \{\s*const sidebarOpen = useStore\(\(s\) => s\.sidebarOpen\);/,
		LAYOUT_HOOK,
		"Layout: inject root translation hook",
	);
	next = replaceOne(next, 'aria-label="Toggle sessions"', LAYOUT_TOGGLE_SESS_ARIA, "Layout: toggle sessions aria");
	next = replaceOne(next, 'title="Toggle sessions"', LAYOUT_TOGGLE_SESS_TITLE, "Layout: toggle sessions title");
	next = replaceOne(next, 'aria-label="Toggle inspector"', LAYOUT_TOGGLE_INSP_ARIA, "Layout: toggle inspector aria");
	next = replaceOne(next, 'title="Toggle inspector"', LAYOUT_TOGGLE_INSP_TITLE, "Layout: toggle inspector title");
	next = replaceOne(next, 'aria-label="Close panels"', LAYOUT_CLOSE_PANELS_ARIA, "Layout: close panels aria");
	next = replaceOne(
		next,
		/function MobileCloseBar\(\{ onClose, side \}: \{ onClose: \(\) => void; side: "left" \| "right" \}\) \{\s*return \(/,
		LAYOUT_MOBILE_CLOSE_HOOK,
		"Layout: inject MobileCloseBar translation hook",
	);
	next = replaceOne(next, />\s*Inspector\s*</, LAYOUT_INSPECTOR_LABEL, "Layout: inspector label");
	next = replaceOne(next, 'aria-label="Close"', LAYOUT_CLOSE_ARIA, "Layout: close button aria");
	next = replaceOne(
		next,
		/function ToolCardsToggle\(\) \{\s*const allCollapsed = useStore\(\(s\) => s\.toolView\.allCollapsed\);/,
		LAYOUT_TOOL_CARDS_HOOK,
		"Layout: inject ToolCardsToggle translation hook",
	);
	next = replaceOne(
		next,
		'aria-label={allCollapsed ? "Expand all tool cards" : "Collapse all tool cards"}',
		LAYOUT_TOOL_CARDS_ARIA,
		"Layout: tool cards aria",
	);
	next = replaceOne(
		next,
		'title={allCollapsed ? "Expand all tool cards" : "Collapse all tool cards"}',
		LAYOUT_TOOL_CARDS_TITLE,
		"Layout: tool cards title",
	);
	return next;
}

function localizeI18nIndex(source: string): string {
	return replaceOne(
		source,
		/function detectLocale\(\): string \{[\s\S]*?\n\}/,
		DETECT_LOCALE_FN,
		"i18n index: default zh locale",
	);
}

function localizeSettingsView(source: string): string {
	let next = injectNamedImport(source, "@/i18n/useLocale", "useLocale");
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
	return next;
}

function localizeTasksView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(
		next,
		/export function TasksView\(\) \{\s*const navigate = useNavigate\(\);/,
		TASKS_HOOK,
		"TasksView: inject translation hook",
	);
	next = replaceOne(next, '<div className="meta">Kanban</div>', TASKS_TITLE, "TasksView: title");
	next = replaceOne(
		next,
		/\{tasks\.length\} task\{tasks\.length === 1 \? "" : "s"\} · \{states\.length\} columns/,
		TASKS_TASK_COUNT,
		"TasksView: task/column count",
	);
	next = replaceOne(next, 'title="Edit columns"', TASKS_EDIT_COLUMNS_TITLE, "TasksView: edit columns title");
	next = replaceOne(next, />\s*Columns\s*</, TASKS_COLUMNS_BTN, "TasksView: columns button");
	next = replaceOne(next, />\s*Loading…\s*</, TASKS_LOADING, "TasksView: loading");
	next = replaceOne(
		next,
		/>\s*No columns\. Open the column editor to add one\.\s*</,
		TASKS_NO_COLUMNS,
		"TasksView: no columns",
	);
	next = replaceOne(
		next,
		/function EmptyInspector\(\) \{\s*return \(/,
		TASKS_EMPTY_INSPECTOR_HOOK,
		"TasksView: inject EmptyInspector translation hook",
	);
	next = replaceOne(
		next,
		/>\s*Click a task to edit, or the Columns button to configure states\.\s*</,
		TASKS_EMPTY_INSPECTOR_TEXT,
		"TasksView: empty inspector text",
	);
	next = replaceOne(
		next,
		/function TasksSidebar\(\{ tasks, states \}: \{ tasks: Task\[\]; states: TaskState\[\] \}\) \{\s*return \(/,
		TASKS_SIDEBAR_HOOK,
		"TasksView: inject TasksSidebar translation hook",
	);
	next = replaceOne(next, '<div className="meta mb-1.5">Overview</div>', TASKS_OVERVIEW, "TasksView: overview");
	next = replaceOne(next, '<div className="meta mb-1.5">Tips</div>', TASKS_TIPS, "TasksView: tips");
	next = replaceOne(next, "<li>Drag cards between columns to change state</li>", TASKS_TIP1, "TasksView: tip1");
	next = replaceOne(next, "<li>Click a column name to edit it</li>", TASKS_TIP2, "TasksView: tip2");
	next = replaceOne(next, "<li>Open in chat sends the task as the first prompt</li>", TASKS_TIP3, "TasksView: tip3");
	return next;
}

function localizeInboxView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");

	// Replace KIND_LABEL values with i18n keys
	next = replaceOne(
		next,
		/const KIND_LABEL: Record<InboxKind, string> = \{[\s\S]*?\};/,
		INBOX_KIND_LABEL,
		"InboxView: KIND_LABEL i18n keys",
	);

	// ── InboxView hook ──
	next = replaceOne(
		next,
		/export function InboxView\(\) \{\s*const setInspectorOpen = useStore\(\(s\) => s\.setInspectorOpen\);/,
		INBOX_VIEW_HOOK,
		"InboxView: inject hook",
	);

	// Header: "All inbox" / KIND_LABEL[filter]
	next = replaceOne(
		next,
		/\{filter === "all" \? "All inbox" : KIND_LABEL\[filter\]\}/,
		INBOX_HEADER_ALL,
		"InboxView: header title",
	);

	// Loading state
	next = replaceOne(next, "<EmptyHint>Loading…</EmptyHint>", INBOX_LOADING, "InboxView: loading");

	// Empty state
	next = replaceOne(
		next,
		/\{filter === "all" \? "Inbox is empty\." : `No \$\{KIND_LABEL\[filter\]\}\.`\}/,
		INBOX_EMPTY_ALL,
		"InboxView: empty state",
	);

	// ── InboxSidebar hook ──
	next = replaceOne(
		next,
		/function InboxSidebar\(\{\s*counts,\s*filter,\s*setFilter,\s*includeProcessed,\s*setIncludeProcessed,\s*onCompose,\s*\}: \{\s*counts: Record<string, number>;\s*filter: Filter;\s*setFilter: \(f: Filter\) => void;\s*includeProcessed: boolean;\s*setIncludeProcessed: \(v: boolean\) => void;\s*onCompose: \(\) => void;\s*\}\) \{/,
		INBOX_SIDEBAR_HOOK,
		"InboxView: inject InboxSidebar hook",
	);

	next = replaceOne(next, />\s*Capture\s*</, INBOX_SIDEBAR_CAPTURE, "InboxView: sidebar capture button");

	// Sidebar Filter label
	next = replaceOne(next, '<div className="meta mb-1.5">Filter</div>', INBOX_SIDEBAR_FILTER, "InboxView: filter label");


	// Sidebar Show processed
	next = replaceOne(next, "<span>Show processed</span>", INBOX_SIDEBAR_SHOW_PROCESSED, "InboxView: show processed");

	// ── ListRow hook ──
	next = replaceOne(
		next,
		/function ListRow\(\{\s*item,\s*active,\s*onClick,\s*\}: \{\s*item: InboxItem;\s*active: boolean;\s*onClick: \(\) => void;\s*\}\) \{/,
		INBOX_LIST_ROW_HOOK,
		"InboxView: inject ListRow hook",
	);

	// ListRow aria-label processed/unprocessed
	next = replaceOne(
		next,
		'aria-label={item.processedAt ? "processed" : "unprocessed"}',
		INBOX_LIST_ROW_ARIA,
		"InboxView: list row aria",
	);

	// ── ReaderPane hook ──
	next = replaceOne(
		next,
		/function ReaderPane\(\{\s*item,\s*onOpenInChat,\s*onPromote,\s*onProcess,\s*onDelete,\s*onPatch,\s*onClose,\s*\}: \{\s*item: InboxItem;\s*onOpenInChat: \(\) => void;\s*onPromote: \(\) => void;\s*onProcess: \(\) => void;\s*onDelete: \(\) => void;\s*onPatch: \(body: Parameters<typeof inboxApi\.update>\[1\]\) => void;\s*onClose: \(\) => void;\s*\}\) \{/,
		INBOX_READER_HOOK,
		"InboxView: inject ReaderPane hook",
	);


	// ReaderPane mark processed/unprocessed label
	next = replaceOne(
		next,
		'label={item.processedAt ? "Mark unprocessed" : "Mark processed"}',
		INBOX_READER_MARK_LABEL,
		"InboxView: reader mark label",
	);

	// ReaderPane Delete label
	next = replaceOne(next, 'label="Delete"', INBOX_READER_DELETE_LABEL, "InboxView: reader delete label");

	// ReaderPane Promote to task label
	next = replaceOne(next, 'label="Promote to task"', INBOX_READER_PROMOTE_LABEL, "InboxView: reader promote label");

	// ReaderPane Open in chat hint
	next = replaceOne(
		next,
		'title="Open this item as a new chat session"',
		INBOX_READER_OPEN_IN_CHAT_HINT,
		"InboxView: reader open in chat hint",
	);

	// ReaderPane Open in chat text
	next = replaceOne(next, "<span>Open in chat</span>", INBOX_READER_OPEN_IN_CHAT, "InboxView: reader open in chat");

	// ReaderPane Close label
	next = replaceOne(next, 'label="Close"', INBOX_READER_CLOSE_LABEL, "InboxView: reader close label");

	// ReaderPane Untitled placeholder
	next = replaceOne(next, 'placeholder="Untitled"', INBOX_READER_UNTITLED, "InboxView: reader untitled placeholder");

	// ReaderPane add notes placeholder
	next = replaceOne(
		next,
		'placeholder="Click to add notes…"',
		INBOX_READER_ADD_NOTES,
		"InboxView: reader add notes placeholder",
	);

	// ── ComposePane hook ──
	next = replaceOne(
		next,
		/function ComposePane\(\{\s*onClose,\s*onCreated,\s*\}: \{\s*onClose: \(\) => void;\s*onCreated: \(item: InboxItem\) => void;\s*\}\) \{/,
		INBOX_COMPOSE_HOOK,
		"InboxView: inject ComposePane hook",
	);


	// ComposePane Cancel
	next = replaceOne(next, ">\n\t\t\t\t\t\tCancel\n\t\t\t\t\t<", INBOX_COMPOSE_CANCEL, "InboxView: compose cancel");

	// ComposePane Capture button
	next = replaceOne(next, ">\n\t\t\t\t\t\tCapture\n\t\t\t\t\t<", INBOX_COMPOSE_CAPTURE, "InboxView: compose capture button");

	// ComposePane title placeholder
	next = replaceOne(
		next,
		'placeholder="Title — short summary of the thought"',
		INBOX_COMPOSE_TITLE_PLACEHOLDER,
		"InboxView: compose title placeholder",
	);

	// ComposePane save hint
	next = replaceOne(
		next,
		/⌘\+enter to save · esc to cancel/,
		INBOX_COMPOSE_SAVE_HINT,
		"InboxView: compose save hint",
	);

	// ComposePane body placeholder
	next = replaceOne(
		next,
		'placeholder="Body — details, context, links… (markdown supported)"',
		INBOX_COMPOSE_BODY_PLACEHOLDER,
		"InboxView: compose body placeholder",
	);

	// ── EmptyReader hook ──
	next = replaceOne(
		next,
		/function EmptyReader\(\{ onCompose \}: \{ onCompose: \(\) => void \}\) \{/,
		INBOX_EMPTY_READER_HOOK,
		"InboxView: inject EmptyReader hook",
	);

	// EmptyReader detail text
	next = replaceOne(
		next,
		'<div className="text-sm text-ink-3">Pick an item to read, or capture a new one.</div>',
		INBOX_EMPTY_READER_DETAIL,
		"InboxView: empty reader detail",
	);

	// EmptyReader Capture button
	next = replaceOne(next, />\s*Capture\s*</, INBOX_EMPTY_READER_CAPTURE, "InboxView: empty reader capture button");

	return next;
}

function localizeRoutinesView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");

	// ── RoutinesView hook
	next = replaceOne(
		next,
		/export function RoutinesView\(\) \{\s*const \[params, setParams\] = useSearchParams\(\);/,
		ROUTINES_VIEW_HOOK,
		"RoutinesView: inject hook",
	);

	// ── RoutinesIndex hook
	next = replaceOne(
		next,
		/function RoutinesIndex\(\{\s*routines,\s*metrics,\s*loading,\s*error,\s*onNew,\s*onOpen,\s*onToggleEnabled,\s*onRunNow,\s*\}: \{\s*routines: Routine\[\];\s*metrics: Record<string, RoutineMetrics>;\s*loading: boolean;\s*error: string \| undefined;\s*onNew: \(\) => void;\s*onOpen: \(r: Routine\) => void;\s*onToggleEnabled: \(r: Routine\) => void;\s*onRunNow: \(r: Routine\) => void;\s*\}\) \{/,
		ROUTINES_INDEX_HOOK,
		"RoutinesIndex: inject hook",
	);

	// ── RoutineListItem hook
	next = replaceOne(
		next,
		/function RoutineListItem\(\{\s*routine,\s*metrics,\s*onOpen,\s*onToggleEnabled,\s*onRunNow,\s*\}: \{\s*routine: Routine;\s*metrics: RoutineMetrics \| undefined;\s*onOpen: \(r: Routine\) => void;\s*onToggleEnabled: \(r: Routine\) => void;\s*onRunNow: \(r: Routine\) => void;\s*\}\) \{/,
		ROUTINE_LIST_ITEM_HOOK,
		"RoutineListItem: inject hook",
	);

	// ── RoutinesSidebar hook
	next = replaceOne(
		next,
		/function RoutinesSidebar\(\{\s*routines,\s*onNew,\s*onInstallTemplate,\s*\}: \{\s*routines: Routine\[\];\s*onNew: \(\) => void;\s*onInstallTemplate: \(slug: string\) => void;\s*\}\) \{/,
		ROUTINES_SIDEBAR_HOOK,
		"RoutinesSidebar: inject hook",
	);

	// ── EditorSidebar hook
	next = replaceOne(
		next,
		/function EditorSidebar\(\{ onBack, onNew \}: \{ onBack: \(\) => void; onNew: \(\) => void \}\) \{/,
		EDITOR_SIDEBAR_HOOK,
		"EditorSidebar: inject hook",
	);

	// ── IndexInspector hook
	next = replaceOne(
		next,
		/function IndexInspector\(\{ routines, metrics \}: \{ routines: Routine\[\]; metrics: Record<string, RoutineMetrics> \}\) \{/,
		INDEX_INSPECTOR_HOOK,
		"IndexInspector: inject hook",
	);

	// ── RoutinesIndex strings
	next = replaceOne(next, '<div className="meta">Routines</div>', ROUTINES_TITLE, "RoutinesIndex: title");
	next = replaceOne(
		next,
		/\{routines\.length\} total · \{routines\.filter\(\(r\) => r\.enabled\)\.length\} enabled · \{routines\.filter\(\(r\) => r\.specVersion === 1\)\.length\} pipelines/,
		ROUTINES_SUMMARY,
		"RoutinesIndex: summary",
	);
	next = replaceOne(next, />\s*New routine\s*</, ROUTINES_NEW_ROUTINE, "RoutinesIndex: new routine btn");
	next = replaceOne(
		next,
		/<div className="flex flex-1 items-center justify-center text-sm text-ink-3">Loading\.\.\.<\/div>/,
		ROUTINES_LOADING,
		"RoutinesIndex: loading",
	);
	next = replaceOne(next, '<div className="meta mb-1.5">No routines yet</div>', ROUTINES_NO_ROUTINES, "RoutinesIndex: no routines");
	next = replaceOne(
		next,
		/<p className="text-sm text-ink-2">Create a pipeline or install the daily briefing template\.<\/p>/,
		ROUTINES_NO_ROUTINES_HINT,
		"RoutinesIndex: no routines hint",
	);

	// ── RoutinesView: loading routine
	next = replaceOne(
		next,
		/<div className="flex h-full items-center justify-center px-6 text-center font-mono text-2xs text-ink-3">\s*Loading routine\.\.\.\s*<\/div>/,
		ROUTINES_LOADING_ROUTINE,
		"RoutinesView: loading routine",
	);

	// ── RoutineListItem strings
	next = replaceOne(
		next,
		/\{routine\.specVersion === 1 \? "pipeline" : routine\.actionKind\}/,
		ROUTINES_PIPELINE_CHIP,
		"RoutineListItem: pipeline chip",
	);
	next = replaceOne(next, /\{stepCount\} steps/, ROUTINES_STEPS, "RoutineListItem: steps");
	next = replaceOne(next, /\{okPct\}% ok/, ROUTINES_PERCENT_OK, "RoutineListItem: percent ok");
	next = replaceOne(
		next,
		/\{routine\.cron \? <span>\{routine\.cron\}<\/span> : <span>manual<\/span>\}/,
		ROUTINES_MANUAL,
		"RoutineListItem: manual",
	);
	next = replaceOne(
		next,
		/\{routine\.nextRunAt \? <span>next \{new Date\(routine\.nextRunAt\)\.toLocaleString\(\)\}<\/span> : null\}/,
		ROUTINES_NEXT,
		"RoutineListItem: next",
	);
	next = replaceOne(
		next,
		/\{routine\.lastRunAt \? <span>last \{new Date\(routine\.lastRunAt\)\.toLocaleString\(\)\}<\/span> : null\}/,
		ROUTINES_LAST,
		"RoutineListItem: last",
	);
	next = replaceOne(next, />\s*Run\s*</, ROUTINES_RUN_BTN, "RoutineListItem: run btn");
	next = replaceOne(next, 'title="Run now"', ROUTINES_RUN_NOW_TITLE, "RoutineListItem: run now title");
	next = replaceOne(
		next,
		/\{routine\.enabled \? "On" : "Off"\}/,
		ROUTINES_ON_OFF,
		"RoutineListItem: on/off",
	);
	next = replaceOne(
		next,
		/title=\{routine\.enabled \? "Disable" : "Enable"\}/,
		ROUTINES_ENABLE_DISABLE_TITLE,
		"RoutineListItem: enable/disable title",
	);

	// ── RoutinesSidebar strings
	next = replaceOne(next, '<div className="meta mb-1.5">Schedule</div>', ROUTINES_SCHEDULE_LABEL, "RoutinesSidebar: schedule label");
	next = replaceOne(next, 'label="enabled"', ROUTINES_STAT_ENABLED, "RoutinesSidebar: stat enabled");
	next = replaceOne(next, 'label="disabled"', ROUTINES_STAT_DISABLED, "RoutinesSidebar: stat disabled");
	next = replaceOne(next, 'label="pipelines"', ROUTINES_STAT_PIPELINES, "RoutinesSidebar: stat pipelines");
	next = replaceOne(next, '<div className="meta mb-1.5">Templates</div>', ROUTINES_TEMPLATES_LABEL, "RoutinesSidebar: templates label");
	next = replaceOne(
		next,
		/<div className="font-mono text-2xs text-ink-3">Loading\.\.\.<\/div>/,
		ROUTINES_TEMPLATES_LOADING,
		"RoutinesSidebar: templates loading",
	);
	next = replaceOne(next, '<div className="font-mono text-2xs text-ink-3">No templates.</div>', ROUTINES_NO_TEMPLATES, "RoutinesSidebar: no templates");

	// Rename template map callback param `t` → `tpl` to avoid shadowing i18n `t`
	next = replaceOne(next, "templates.map((t) => (", ROUTINES_TEMPLATE_MAP, "RoutinesSidebar: template map rename t→tpl");
	next = replaceOne(next, /t\.slug/g, "tpl.slug", "RoutinesSidebar: tpl.slug");
	next = replaceOne(next, /t\.name/g, "tpl.name", "RoutinesSidebar: tpl.name");
	next = replaceOne(next, /t\.description/g, "tpl.description", "RoutinesSidebar: tpl.description");
	next = replaceOne(
		next,
		/\{t\.steps\} steps · \{t\.triggers\} triggers/,
		ROUTINES_TEMPLATE_STEPS_TRIGGERS,
		"RoutinesSidebar: template steps/triggers",
	);

	next = replaceOne(next, '<div className="meta mb-1.5">Cron format</div>', ROUTINES_CRON_LABEL, "RoutinesSidebar: cron label");

	// ── EditorSidebar strings
	next = replaceOne(next, />\s*All routines\s*</, ROUTINES_ALL_ROUTINES, "EditorSidebar: all routines");
	next = replaceOne(next, '<div className="meta mb-1.5">Editor</div>', ROUTINES_EDITOR_LABEL, "EditorSidebar: editor label");
	next = replaceOne(
		next,
		/<p className="text-xs leading-relaxed text-ink-3">\s*The builder now uses the main canvas\. Use the right inspector for runs and actions\.\s*<\/p>/,
		ROUTINES_EDITOR_NOTE,
		"EditorSidebar: editor note",
	);

	// ── IndexInspector strings
	next = replaceOne(next, '<div className="meta mb-2">Overview</div>', ROUTINES_OVERVIEW_LABEL, "IndexInspector: overview label");
	next = replaceOne(next, "<span>Total routines</span>", ROUTINES_TOTAL_ROUTINES, "IndexInspector: total routines");
	next = replaceOne(next, "<span>Runs recorded</span>", ROUTINES_RUNS_RECORDED, "IndexInspector: runs recorded");
	next = replaceOne(next, '<div className="meta mb-2">Next fire</div>', ROUTINES_NEXT_FIRE_LABEL, "IndexInspector: next fire label");
	next = replaceOne(
		next,
		/<div className="font-mono text-2xs text-ink-3">No enabled scheduled routines\.<\/div>/,
		ROUTINES_NO_ENABLED_SCHEDULES,
		"IndexInspector: no enabled schedules",
	);

	return next;
}

function localizeMarketplaceView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	// ── MarketplaceView hook
	next = replaceOne(
		next,
		/export function MarketplaceView\(\) \{\s*const \[data, setData\] = useState<ListMarketplaceResponse \| null>\(null\);/,
		`export function MarketplaceView() {
	const { t } = useTranslation();
	const [data, setData] = useState<ListMarketplaceResponse | null>(null);`,
		"MarketplaceView: inject hook",
	);
	// ── MarketplaceSidebar hook
	next = replaceOne(
		next,
/function MarketplaceSidebar\(\{[\s\S]*?\}\) \{/,
		`function MarketplaceSidebar({
	sources,
	counts,
	scope,
	onScope,
	marketplaceFilter,
	onMarketplaceFilter,
	onAdd,
	onRefresh,
	refreshing,
	onRemoveSource,
}: {
	sources: MarketplaceSource[];
	counts: { all: number; installed: number; available: number };
	scope: ScopeFilter;
	onScope: (s: ScopeFilter) => void;
	marketplaceFilter: string | "all";
	onMarketplaceFilter: (s: string | "all") => void;
	onAdd: () => void;
	onRefresh: () => void;
	refreshing: boolean;
	onRemoveSource: (name: string) => void;
}) {
	const { t } = useTranslation();
`,
		"MarketplaceView: inject MarketplaceSidebar hook",
	);
	// ── EmptySources hook
	next = replaceOne(
		next,
		/function EmptySources\(\{ onAdd, onAdded \}: \{ onAdd: \(\) => void; onAdded: \(\) => void \}\) \{/,
		`function EmptySources({ onAdd, onAdded }: { onAdd: () => void; onAdded: () => void }) {
	const { t } = useTranslation();`,
		"MarketplaceView: inject EmptySources hook",
	);
	// ── EntryCard hook
	next = replaceOne(
		next,
/function EntryCard\(\{[\s\S]*?\}\) \{/,
		`function EntryCard({
	entry,
	isSelected,
	busy,
	onSelect,
	onInstall,
	onUninstall,
}: {
	entry: MarketplaceCatalogEntry;
	isSelected: boolean;
	busy: boolean;
	onSelect: () => void;
	onInstall: () => void;
	onUninstall: () => void;
}) {
	const { t } = useTranslation();`,
		"MarketplaceView: inject EntryCard hook",
	);
	// ── MarketplaceInspector hook
	next = replaceOne(
		next,
		/function MarketplaceInspector\(\{ entry \}: \{ entry: MarketplaceCatalogEntry \| undefined \}\) \{/,
		`function MarketplaceInspector({ entry }: { entry: MarketplaceCatalogEntry | undefined }) {
	const { t } = useTranslation();`,
		"MarketplaceView: inject MarketplaceInspector hook",
	);
	// ── AddMarketplaceModalHost hook
	next = replaceOne(
		next,
		/export function AddMarketplaceModalHost\(\{ open, onClose, onAdded \}: \{ open: boolean; onClose: \(\) => void; onAdded: \(\) => void \}\) \{/,
		`export function AddMarketplaceModalHost({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
	const { t } = useTranslation();`,
		"MarketplaceView: inject AddMarketplaceModalHost hook",
	);
	// ── Title and text replacements
	next = replaceOne(next, '<div className="meta">Marketplace</div>', MARKETPLACE_TITLE, "MarketplaceView: title");
	next = replaceOne(next, '"loading..."', `t("common.status.loading")`, "MarketplaceView: loading text");
	next = replaceOne(
		next,
		'placeholder="Search by name, tag, description"',
		MARKETPLACE_SEARCH_PLACEHOLDER,
		"MarketplaceView: search placeholder",
	);
	next = replaceOne(
		next,
		'<div className="px-3 py-6 text-center text-sm text-ink-3">Loading marketplace catalog...</div>',
		MARKETPLACE_CATALOG_LOADING,
		"MarketplaceView: catalog loading",
	);
	next = replaceOne(
		next,
		'No catalog entries match the current filters.',
		MARKETPLACE_NO_MATCHES,
		"MarketplaceView: no matches",
	);
	next = replaceOne(next, '<div className="meta">Catalog</div>', MARKETPLACE_CATALOG_LABEL, "MarketplaceView: catalog label");
	next = replaceOne(next, 'title="Refresh marketplaces"', MARKETPLACE_REFRESH_TITLE, "MarketplaceView: refresh title");
	next = replaceOne(next, 'title="Add marketplace"', MARKETPLACE_ADD_TITLE, "MarketplaceView: add title");
	next = replaceOne(next, '<span className="truncate">All marketplaces</span>', MARKETPLACE_ALL_MARKETPLACES, "MarketplaceView: all marketplaces");
	next = replaceOne(next, '<div className="meta">No marketplaces yet</div>', MARKETPLACE_NO_MARKETPLACES, "MarketplaceView: no marketplaces");
	next = replaceOne(
		next,
		'Add a marketplace catalog (GitHub repo, git URL, or local path) to browse and install plugins.',
		MARKETPLACE_NO_MARKETPLACES_HINT,
		"MarketplaceView: no marketplaces hint",
	);
	next = replaceOne(next, '<div className="meta">Suggested</div>', MARKETPLACE_SUGGESTED, "MarketplaceView: suggested");
	next = replaceOne(next, '<div className="meta">Plugin details</div>', MARKETPLACE_PLUGIN_DETAILS, "MarketplaceView: plugin details");
	next = replaceOne(next, '<p>Select a plugin to see its full metadata.</p>', MARKETPLACE_PLUGIN_DETAILS_HINT, "MarketplaceView: plugin details hint");
	next = replaceOne(next, '<div className="meta">Add marketplace</div>', MARKETPLACE_ADD_MARKETPLACE_MODAL_TITLE, "MarketplaceView: add modal title");
	next = replaceOne(next, 'title="Uninstall"', MARKETPLACE_UNINSTALL_TITLE, "MarketplaceView: uninstall title");
	next = replaceOne(next, 'label="All"', MARKETPLACE_ALL_LABEL, "MarketplaceView: all scope label");
	next = replaceOne(next, 'label="Installed"', MARKETPLACE_INSTALLED_LABEL, "MarketplaceView: installed scope label");
	next = replaceOne(next, 'label="Available"', MARKETPLACE_AVAILABLE_LABEL, "MarketplaceView: available scope label");
	next = replaceOne(next, '<div className="meta">Sources</div>', MARKETPLACE_SOURCES_LABEL, "MarketplaceView: sources label");
	return next;
}

function localizeKbView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	// ── KbView hook
	next = replaceOne(
		next,
		/export function KbView\(\) \{\s*const \[params, setParams\] = useSearchParams\(\);/,
		`export function KbView() {
	const { t } = useTranslation();
	const [params, setParams] = useSearchParams();`,
		"KbView: inject hook",
	);
	// ── KbTopBar hook
	next = replaceOne(
		next,
/function KbTopBar\(\{[\s\S]*?\}\) \{/,
		`function KbTopBar({
	currentPath,
	mobileDetailOpen,
	viewMode,
	onViewMode,
	onBack,
}: {
	currentPath: string | undefined;
	mobileDetailOpen: boolean;
	viewMode: "file" | "graph";
	onViewMode: (v: "file" | "graph") => void;
	onBack: () => void;
}) {
	const { t } = useTranslation();
`,
		"KbView: inject KbTopBar hook",
	);
	// ── KbSidebar hook
	next = replaceOne(
		next,
		/function KbSidebar\(\) \{\s*return \(/,
		`function KbSidebar() {
	const { t } = useTranslation();
	return (`,
		"KbView: inject KbSidebar hook",
	);
	// ── KbEmpty hook
	next = replaceOne(
		next,
		/function KbEmpty\(\) \{\s*return \(/,
		`function KbEmpty() {
	const { t } = useTranslation();
	return (`,
		"KbView: inject KbEmpty hook",
	);
	// ── GraphPreviewEmpty hook
	next = replaceOne(
		next,
		/function GraphPreviewEmpty\(\) \{\s*return \(/,
		`function GraphPreviewEmpty() {
	const { t } = useTranslation();
	return (`,
		"KbView: inject GraphPreviewEmpty hook",
	);
	// ── KbWelcome hook
	next = replaceOne(
		next,
/function KbWelcome\(\{[\s\S]*?\}\) \{/,
		`function KbWelcome({
	status,
	onInitialized,
}: {
	status: KbStatusResponse;
	onInitialized: () => void;
}) {
	const { t } = useTranslation();`,
		"KbView: inject KbWelcome hook",
	);
	// ── KbInspector hook
	next = replaceOne(
		next,
/function KbInspector\(\{[\s\S]*?\}\) \{/,
		`function KbInspector({
	currentPath,
	onNavigate,
	kbChangeCounter,
}: {
	currentPath: string | undefined;
	onNavigate: (p: string) => void;
	kbChangeCounter: number;
}) {
	const { t } = useTranslation();`,
		"KbView: inject KbInspector hook",
	);
	// ── Title and text replacements
	next = replaceOne(next, '<div className="meta">Knowledge</div>', `<div className="meta">{t("kb.title")}</div>`, "KbView: title");
	next = replaceOne(next, '<div className="meta">Knowledge</div>', `<div className="meta">{t("kb.title")}</div>`, "KbView: sidebar title");
	next = replaceOne(next, 'aria-label="Back to tree"', `aria-label={t("kb.backToTree")}`, "KbView: back to tree aria");
	next = replaceOne(next, 'title="File viewer (?view=file)"', `title={t("kb.fileViewer")}`, "KbView: file viewer title");
	next = replaceOne(next, 'title="Force-directed graph (?view=graph)"', `title={t("kb.graphViewer")}`, "KbView: graph viewer title");
	next = replaceOne(next, />\s*File\s*</, `>{t("kb.file")}<`, "KbView: file tab");
	next = replaceOne(next, />\s*Graph\s*</, `>{t("kb.graph")}<`, "KbView: graph tab");
	next = replaceOne(
		next,
		'<div className="mt-3 text-sm text-ink-2">Pick a file from the tree.</div>',
		`<div className="mt-3 text-sm text-ink-2">{t("kb.pickFile")}</div>`,
		"KbView: empty pick file",
	);
	next = replaceOne(
		next,
		'<div className="mt-3 text-sm text-ink-2">Click a node</div>',
		`<div className="mt-3 text-sm text-ink-2">{t("kb.clickNode")}</div>`,
		"KbView: graph empty click node",
	);
	next = replaceOne(
		next,
		/<h1 className="text-base font-medium text-ink">Set up your knowledge base<\/h1>/,
		`<h1 className="text-base font-medium text-ink">{t("kb.setupTitle")}</h1>`,
		"KbView: welcome title",
	);
	next = replaceOne(
		next,
		/Create starter README/,
		`{t("kb.createStarter")}`,
		"KbView: create starter btn",
	);
	next = replaceOne(
		next,
		/Or set <span className="font-mono text-ink-2">OMP_DECK_KB_ROOT<\/span> and restart the deck\./,
		`{t("kb.orSetEnv")}`,
		"KbView: or set env text",
	);
	next = replaceOne(
		next,
		/<div className="meta">Inspector<\/div>/,
		`<div className="meta">{t("kb.inspector")}</div>`,
		"KbView: inspector meta",
	);
	next = replaceOne(
		next,
		/Pick a file to inspect\./,
		`<div className="text-sm text-ink-2">{t("kb.pickFileInspect")}</div>`,
		"KbView: pick file inspect",
	);
	return next;
}

function localizeIntegrationsView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	// ── IntegrationsView hook
	next = replaceOne(
		next,
		/export function IntegrationsView\(\) \{\s*return \(/,
		`export function IntegrationsView() {
	const { t } = useTranslation();
	return (`,
		"IntegrationsView: inject hook",
	);
	// ── Title and text replacements
	next = replaceOne(next, '<div className="meta mb-2">Integrations</div>', `<div className="meta mb-2">{t("integrations.title")}</div>`, "IntegrationsView: sidebar title");
	next = replaceOne(next, '<div className="meta">Integrations</div>', `<div className="meta">{t("integrations.title")}</div>`, "IntegrationsView: header title");
	next = replaceOne(
		next,
		'<h2 className="text-lg font-medium text-ink">Coming in V1.5</h2>',
		`<h2 className="text-lg font-medium text-ink">{t("integrations.comingTitle")}</h2>`,
		"IntegrationsView: coming title",
	);
	next = replaceOne(
		next,
		'<div className="meta mb-1.5">Design doc</div>',
		`<div className="meta mb-1.5">{t("integrations.designDoc")}</div>`,
		"IntegrationsView: design doc label",
	);
	return next;
}

function localizeOnboardingView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	// ── OnboardingView hook
	next = replaceOne(
		next,
		/export function OnboardingView\(\) \{\s*const navigate = useNavigate\(\);/,
		`export function OnboardingView() {
	const { t } = useTranslation();
	const navigate = useNavigate();`,
		"OnboardingView: inject hook",
	);
	// ── Step1Welcome hook
	next = replaceOne(
		next,
		/function Step1Welcome\(\{ onNext \}: \{ onNext: \(\) => void \}\) \{\s*return \(/,
		`function Step1Welcome({ onNext }: { onNext: () => void }) {
	const { t } = useTranslation();
	return (`,
		"OnboardingView: inject Step1Welcome hook",
	);
	// ── Step2Kb hook
	next = replaceOne(
		next,
/function Step2Kb\(\{[\s\S]*?\}\) \{/,
		`function Step2Kb({
	state,
	onRefresh,
	onNext,
}: {
	state: OnboardingState;
	onRefresh: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
`,
		"OnboardingView: inject Step2Kb hook",
	);
	// ── Step3Provider hook
	next = replaceOne(
		next,
/function Step3Provider\(\{[\s\S]*?\}\) \{/,
		`function Step3Provider({
	state,
	onRefresh,
	onNext,
}: {
	state: OnboardingState;
	onRefresh: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
`,
		"OnboardingView: inject Step3Provider hook",
	);
	// ── Step4AutoStart hook
	next = replaceOne(
		next,
/function Step4AutoStart\(\{[\s\S]*?\}\) \{/,
		`function Step4AutoStart({
	state,
	onRefresh,
	onNext,
}: {
	state: OnboardingState;
	onRefresh: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
`,
		"OnboardingView: inject Step4AutoStart hook",
	);
	// ── Step5Done hook
	next = replaceOne(
		next,
		/function Step5Done\(\{ onFinish \}: \{ onFinish: \(\) => void \}\) \{/,
		`function Step5Done({ onFinish }: { onFinish: () => void }) {
	const { t } = useTranslation();`,
		"OnboardingView: inject Step5Done hook",
	);
	// ── Text replacements
	next = replaceOne(
		next,
		'<div className="meta text-ink-3">omp·deck onboarding</div>',
		`<div className="meta text-ink-3">{t("onboarding.header")}</div>`,
		"OnboardingView: header",
	);
	next = replaceOne(
		next,
		/\{s\.title\}/,
		`{t("onboarding.steps." + s.key)}`,
		"OnboardingView: step title",
	);
	next = replaceOne(
		next,
		'Skip setup',
		`{t("onboarding.skipSetup")}`,
		"OnboardingView: skip setup",
	);
	next = replaceOne(
		next,
		'title="Mark onboarding done and go straight to the deck"',
		`title={t("onboarding.skipSetup")}`,
		"OnboardingView: skip setup title",
	);
	return next;
}

function localizeSkillsView(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	// ── SkillsView hook
	next = replaceOne(
		next,
		/export function SkillsView\(\) \{\s*const \[data, setData\] = useState<ListSkillsResponse \| null>\(null\);/,
		`export function SkillsView() {
	const { t } = useTranslation();
	const [data, setData] = useState<ListSkillsResponse | null>(null);`,
		"SkillsView: inject hook",
	);
	// ── SkillDetailPane hook
	next = replaceOne(
		next,
		/function SkillDetailPane\(\{[\s\S]*?\}\) \{/,
		`function SkillDetailPane({
	skill,
	detail,
	loading,
	error,
	onBack,
}: {
	skill: SkillSummary;
	detail: SkillDetailResponse | null;
	loading: boolean;
	error: string | undefined;
	onBack?: () => void;
}) {
	const { t } = useTranslation();`,
		"SkillsView: inject SkillDetailPane hook",
	);
	// ── EmptyState hook
	next = replaceOne(
		next,
		/function EmptyState\(\{ total \}: \{ total: number \}\) \{\s*return \(/,
		`function EmptyState({ total }: { total: number }) {
	const { t } = useTranslation();
	return (`,
		"SkillsView: inject EmptyState hook",
	);
	// ── SkillsSidebar hook
	next = replaceOne(
		next,
/function SkillsSidebar\(\{[\s\S]*?\}\) \{/,
		`function SkillsSidebar({
	skills,
	providerFilter,
	onProviderFilter,
	levelFilter,
	onLevelFilter,
}: {
	skills: SkillSummary[];
	providerFilter: string | "all";
	onProviderFilter: (p: string | "all") => void;
	levelFilter: LevelFilter;
	onLevelFilter: (l: LevelFilter) => void;
}) {
	const { t } = useTranslation();`,
		"SkillsView: inject SkillsSidebar hook",
	);
	// ── SkillInspector hook
	next = replaceOne(
		next,
/function SkillInspector\(\{[\s\S]*?\}\) \{/,
		`function SkillInspector({
	skill,
	detail,
}: {
	skill: SkillSummary | undefined;
	detail: SkillDetailResponse | null;
}) {
	const { t } = useTranslation();`,
		"SkillsView: inject SkillInspector hook",
	);
	// ── Title and text replacements
	next = replaceOne(next, '<div className="meta">Skills</div>', `<div className="meta">{t("skills.title")}</div>`, "SkillsView: title header");
	next = replaceOne(
		next,
		'placeholder="Search name, description, triggers, tags"',
		`placeholder={t("skills.searchPlaceholder")}`,
		"SkillsView: search placeholder",
	);
	next = replaceOne(
		next,
		'<div className="px-3 py-6 text-center text-sm text-ink-3">Loading skills...</div>',
		`<div className="px-3 py-6 text-center text-sm text-ink-3">{t("common.status.loading")}</div>`,
		"SkillsView: loading skills",
	);
	// EmptyState text
	next = replaceOne(
		next,
		'{total === 0 ? "No skills discovered" : "No skills match the current filters"}',
		`{total === 0 ? t("skills.noSkills") : t("skills.noMatches")}`,
		"SkillsView: empty state text",
	);
	next = replaceOne(
		next,
		'{total === 0\n\t\t\t\t\t? "Drop a SKILL.md into ~/.omp/agent/skills/<name>/, or install a marketplace plugin."\n\t\t\t\t\t: "Try clearing the source / level filters or the search box."}',
		`{total === 0
					? t("skills.noSkillsHint")
					: t("skills.noMatchesHint")}`,
		"SkillsView: empty state hint",
	);
	// SkillDetailPane text
	next = replaceOne(next, 'aria-label="Back to skill list"', `aria-label={t("skills.backToList")}`, "SkillsView: back aria");
	next = replaceOne(next, '<span className="text-ink-4">from plugin</span>', `<span className="text-ink-4">{t("skills.fromPlugin")}</span>`, "SkillsView: from plugin label");
	next = replaceOne(
		next,
		'<div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-3">\n\t\t\t\t\t<Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading SKILL.md...\n\t\t\t\t</div>',
		`<div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-3">
					<Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("common.status.loading")}
				</div>`,
		"SkillsView: detail loading",
	);
	// SkillsSidebar: Source and Level labels
	next = replaceOne(next, '<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">Source</div>', `<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">{t("skills.source")}</div>`, "SkillsView: source label");
	next = replaceOne(next, '<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">Level</div>', `<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">{t("skills.level")}</div>`, "SkillsView: level label");
	// SkillInspector text
	next = replaceOne(next, '<div className="meta">Inspector</div>', `<div className="meta">{t("skills.inspector")}</div>`, "SkillsView: inspector meta");
	next = replaceOne(
		next,
		'<div className="mt-0.5 text-xs text-ink-3">SKILL.md frontmatter + co-located files.</div>',
		`<div className="mt-0.5 text-xs text-ink-3">{t("skills.inspectorHint")}</div>`,
		"SkillsView: inspector hint",
	);
	next = replaceOne(
		next,
		'<div className="px-3 py-4 text-xs text-ink-3">Pick a skill to inspect.</div>',
		`<div className="px-3 py-4 text-xs text-ink-3">{t("skills.pickSkill")}</div>`,
		"SkillsView: pick skill",
	);
	next = replaceOne(
		next,
		'{skill.enabled ? "yes" : "hidden (frontmatter)"}',
		`{skill.enabled ? t("skills.enabledYes") : t("skills.enabledHidden")}`,
		"SkillsView: enabled values",
	);
	next = replaceOne(
		next,
		/<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">\s*Bundled files/,
		`<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">
						{t("skills.bundledFiles")}`,
		"SkillsView: bundled files label",
	);
	next = replaceOne(
		next,
		/<div className="mt-1 text-2xs text-ink-4">\s*Reachable on demand — not auto-injected into the agent's context\.\s*<\/div>/,
		`<div className="mt-1 text-2xs text-ink-4">
							{t("skills.reachableOnDemand")}
						</div>`,
		"SkillsView: reachable hint",
	);
	return next;
}

function replaceOne(source: string, search: RegExp | string, replacement: string, label: string): string {
	const next = source.replace(search, replacement);
	if (next === source) {
		throw new Error(`${label} not found`);
	}
	return next;
}

function injectNamedImport(source: string, moduleName: string, importName: string): string {
	const importLine = `import { ${importName} } from "${moduleName}";`;
	if (source.includes(importLine)) return source;

	const lines = source.split(/\r?\n/);
	const lastImportIndex = findLastImportIndex(lines);
	if (lastImportIndex === -1) return `${importLine}\n${source}`;
	lines.splice(lastImportIndex + 1, 0, importLine);
	return `${lines.join("\n")}\n`;
}

function findLastImportIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		if (lines[i]?.startsWith("import ")) return i;
	}
	return -1;
}

void main().catch((error) => {
	console.error("[l10n:prepare] failed:", error);
	process.exitCode = 1;
});

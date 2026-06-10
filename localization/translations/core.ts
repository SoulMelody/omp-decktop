export const NAV_RAIL_I18N = {
	settings: "nav.settings",
} as const;

export const SIDEBAR_I18N = {
	workspace: "sidebar.workspace",
	refreshWorkspaces: "sidebar.refreshWorkspaces",
	allWorkspaces: "sidebar.allWorkspaces",
	newSession: "sidebar.newSession",
	sessions: "sidebar.sessions",
	refreshSessions: "sidebar.refreshSessions",
	noSessions: "sidebar.noSessions",
	activeStatus: "common.status.active",
} as const;

export const NOTIFICATION_BANNER_I18N = {
	blocked: "notifications.permission.blocked",
	dismiss: "common.actions.dismiss",
	prompt: "notifications.permission.prompt",
	enable: "notifications.permission.enable",
	notNow: "notifications.permission.notNow",
} as const;

export const NOTIFICATION_TOAST_I18N = {
	view: "notifications.toast.view",
	dismissNotification: "notifications.toast.dismissNotification",
} as const;

export const LAYOUT_I18N = {
	toggleSessions: "layout.toggleSessions",
	toggleInspector: "layout.toggleInspector",
	closePanels: "layout.closePanels",
	inspector: "layout.inspector",
	close: "common.actions.close",
	expandAllToolCards: "layout.expandAllToolCards",
	collapseAllToolCards: "layout.collapseAllToolCards",
} as const;

export const NAV_RAIL_ITEMS = `const ITEMS: ReadonlyArray<{
\tto: string;
\tlabelKey: string;
\ticon: typeof MessagesSquare;
}> = [
\t{ to: "/", labelKey: "nav.chat", icon: MessagesSquare },
\t{ to: "/tasks", labelKey: "nav.tasks", icon: KanbanSquare },
\t{ to: "/routines", labelKey: "nav.routines", icon: Clock },
\t{ to: "/inbox", labelKey: "nav.inbox", icon: Inbox },
\t{ to: "/marketplace", labelKey: "nav.marketplace", icon: Store },
\t{ to: "/skills", labelKey: "nav.skills", icon: Sparkles },
\t{ to: "/kb", labelKey: "nav.knowledge", icon: BookOpen },
\t{ to: "/integrations", labelKey: "nav.integrations", icon: Plug },
];`;

export const NAV_RAIL_HOOK = `export function NavRail() {
\tconst { t } = useTranslation();
\treturn (`;

export const NAV_RAIL_LABEL = "t(item.labelKey)";

export const NAV_RAIL_SETTINGS_TITLE = `title={t("${NAV_RAIL_I18N.settings}")}`;

export const NAV_RAIL_SETTINGS_ARIA = `aria-label={t("${NAV_RAIL_I18N.settings}")}`;

export const SIDEBAR_HOOK = `export function Sidebar() {
\tconst { t } = useTranslation();
\tconst workspaces = useStore((s) => s.workspaces);`;

export const SIDEBAR_WORKSPACE_LABEL = `<div className="meta">{t("${SIDEBAR_I18N.workspace}")}</div>`;

export const SIDEBAR_REFRESH_WS_ARIA = `aria-label={t("${SIDEBAR_I18N.refreshWorkspaces}")}`;

export const SIDEBAR_ALL_WS_OPTION = `<option value="">{t("${SIDEBAR_I18N.allWorkspaces}")}</option>`;

export const SIDEBAR_NEW_SESSION = `>{t("${SIDEBAR_I18N.newSession}")}<`;

export const SIDEBAR_SESSIONS_SUMMARY = `<div className="meta">{t("\x24{SIDEBAR_I18N.sessions}")} / {filtered.length}</div>`;

export const SIDEBAR_REFRESH_SESS_ARIA = `aria-label={t("${SIDEBAR_I18N.refreshSessions}")}`;

export const SIDEBAR_NO_SESSIONS = `>{t("${SIDEBAR_I18N.noSessions}")}<`;

export const SIDEBAR_SESSION_ROW_HOOK = `onClick: () => void;
}) {
\tconst { t } = useTranslation();
\treturn (`;

export const SIDEBAR_LIVE_ARIA = `aria-label={t("${SIDEBAR_I18N.activeStatus}")}`;

export const SIDEBAR_PLAN_MODE_TITLE = `title={t("${SIDEBAR_I18N.activeStatus}")}`;

export const NOTIFICATION_BANNER_HOOK = `export function NotificationPermissionBanner(): JSX.Element | null {
\tconst { t } = useTranslation();
\tconst { permission, requestPermission, bannerDismissed, dismissBanner } = useNotificationPermission();`;

export const NOTIFICATION_BANNER_BLOCKED = `<span>{t("${NOTIFICATION_BANNER_I18N.blocked}")}</span>`;

export const NOTIFICATION_BANNER_DISMISS = `>{t("${NOTIFICATION_BANNER_I18N.dismiss}")}<`;

export const NOTIFICATION_BANNER_PROMPT = `<span>{t("${NOTIFICATION_BANNER_I18N.prompt}")}</span>`;

export const NOTIFICATION_BANNER_ENABLE = `>{t("${NOTIFICATION_BANNER_I18N.enable}")}<`;

export const NOTIFICATION_BANNER_NOT_NOW = `>{t("${NOTIFICATION_BANNER_I18N.notNow}")}<`;

export const NOTIFICATION_TOAST_HOOK = `export function NotificationToast(): JSX.Element | null {
\tconst { t } = useTranslation();
\tconst notifications = useStore((s) => s.notifications);`;

export const NOTIFICATION_TOAST_VIEW = `>{t("${NOTIFICATION_TOAST_I18N.view}")}<`;

export const NOTIFICATION_TOAST_DISMISS_ARIA = `aria-label={t("${NOTIFICATION_TOAST_I18N.dismissNotification}")}`;

export const LAYOUT_HOOK = `export function Layout({ sidebar, main, inspector, topBar }: Props) {
\tconst { t } = useTranslation();
\tconst sidebarOpen = useStore((s) => s.sidebarOpen);`;

export const LAYOUT_TOGGLE_SESS_ARIA = `aria-label={t("${LAYOUT_I18N.toggleSessions}")}`;

export const LAYOUT_TOGGLE_SESS_TITLE = `title={t("${LAYOUT_I18N.toggleSessions}")}`;

export const LAYOUT_TOGGLE_INSP_ARIA = `aria-label={t("${LAYOUT_I18N.toggleInspector}")}`;

export const LAYOUT_TOGGLE_INSP_TITLE = `title={t("${LAYOUT_I18N.toggleInspector}")}`;

export const LAYOUT_CLOSE_PANELS_ARIA = `aria-label={t("${LAYOUT_I18N.closePanels}")}`;

export const LAYOUT_MOBILE_CLOSE_HOOK = `function MobileCloseBar({ onClose, side }: { onClose: () => void; side: "left" | "right" }) {
\tconst { t } = useTranslation();
\treturn (`;

export const LAYOUT_INSPECTOR_LABEL = `>{t("${LAYOUT_I18N.inspector}")}<`;

export const LAYOUT_CLOSE_ARIA = `aria-label={t("${LAYOUT_I18N.close}")}`;

export const LAYOUT_TOOL_CARDS_HOOK = `function ToolCardsToggle() {
\tconst { t } = useTranslation();
\tconst allCollapsed = useStore((s) => s.toolView.allCollapsed);`;

export const LAYOUT_TOOL_CARDS_ARIA = `aria-label={allCollapsed ? t("${LAYOUT_I18N.expandAllToolCards}") : t("${LAYOUT_I18N.collapseAllToolCards}")}`;

export const LAYOUT_TOOL_CARDS_TITLE = `title={allCollapsed ? t("${LAYOUT_I18N.expandAllToolCards}") : t("${LAYOUT_I18N.collapseAllToolCards}")}`;

export const DETECT_LOCALE_FN = `function detectLocale(): string {
\ttry {
\t\tconst stored = localStorage.getItem(LOCALE_STORAGE_KEY);
\t\tif (stored && (stored === "en" || stored === "zh-CN")) return stored;
\t} catch {
\t\t/* quota / private browsing */
\t}
\treturn "zh-CN";
\t}`;

import { injectNamedImport, replaceOne } from "../utils/string.js";
import {
	NAV_RAIL_ITEMS,
	NAV_RAIL_LABEL,
	NAV_RAIL_SETTINGS_ARIA,
	NAV_RAIL_SETTINGS_TITLE,
	NAV_RAIL_HOOK,
	SIDEBAR_HOOK,
	SIDEBAR_WORKSPACE_LABEL,
	SIDEBAR_REFRESH_WS_ARIA,
	SIDEBAR_ALL_WS_OPTION,
	SIDEBAR_NEW_SESSION,
	SIDEBAR_SESSIONS_SUMMARY,
	SIDEBAR_REFRESH_SESS_ARIA,
	SIDEBAR_NO_SESSIONS,
	SIDEBAR_SESSION_ROW_HOOK,
	SIDEBAR_LIVE_ARIA,
	SIDEBAR_PLAN_MODE_TITLE,
	NOTIFICATION_BANNER_HOOK,
	NOTIFICATION_BANNER_BLOCKED,
	NOTIFICATION_BANNER_DISMISS,
	NOTIFICATION_BANNER_PROMPT,
	NOTIFICATION_BANNER_ENABLE,
	NOTIFICATION_BANNER_NOT_NOW,
	NOTIFICATION_TOAST_HOOK,
	NOTIFICATION_TOAST_VIEW,
	NOTIFICATION_TOAST_DISMISS_ARIA,
	LAYOUT_HOOK,
	LAYOUT_TOGGLE_SESS_ARIA,
	LAYOUT_TOGGLE_SESS_TITLE,
	LAYOUT_TOGGLE_INSP_ARIA,
	LAYOUT_TOGGLE_INSP_TITLE,
	LAYOUT_CLOSE_PANELS_ARIA,
	LAYOUT_MOBILE_CLOSE_HOOK,
	LAYOUT_INSPECTOR_LABEL,
	LAYOUT_CLOSE_ARIA,
	LAYOUT_TOOL_CARDS_HOOK,
	LAYOUT_TOOL_CARDS_ARIA,
	LAYOUT_TOOL_CARDS_TITLE,
} from "../translations.js";

export function localizeNavRail(source: string): string {
	let next = injectNamedImport(source, "react-i18next", "useTranslation");
	next = replaceOne(next, /const ITEMS: ReadonlyArray<\{[\s\S]*?\n\];/, NAV_RAIL_ITEMS, "NavRail: items config");
	next = replaceOne(next, /export function NavRail\(\) \{\s*return \(/, NAV_RAIL_HOOK, "NavRail: inject translation hook");
	next = replaceOne(next, "item.label", NAV_RAIL_LABEL, "NavRail: item label usage");
	next = replaceOne(next, 'title="Settings"', NAV_RAIL_SETTINGS_TITLE, "NavRail: settings title");
	next = replaceOne(next, 'aria-label="Settings"', NAV_RAIL_SETTINGS_ARIA, "NavRail: settings aria");
	return next;
}

export function localizeSidebar(source: string): string {
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
		/onClick: \(\) => void;\n\s*onDelete\?: \(\) => void;\n\}\) \{\n\treturn \(/,
		SIDEBAR_SESSION_ROW_HOOK,
		"Sidebar: inject SessionRow translation hook",
	);
	next = replaceOne(next, 'aria-label="live"', SIDEBAR_LIVE_ARIA, "Sidebar: live status");
	next = replaceOne(next, 'title="Plan mode active"', SIDEBAR_PLAN_MODE_TITLE, "Sidebar: plan mode title");
	return next;
}

export function localizeNotificationPermissionBanner(source: string): string {
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

export function localizeNotificationToast(source: string): string {
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

export function localizeLayout(source: string): string {
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

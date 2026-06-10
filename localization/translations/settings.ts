export const ZH_SETTINGS_SECTIONS = `const SECTIONS = [
	{ id: "env", label: "环境变量", description: "进程及 Deck 管理的变量" },
	{ id: "providers", label: "服务商", description: "OAuth 登录与 API 密钥状态" },
	{ id: "messaging", label: "消息桥接", description: "Telegram 及未来的聊天桥接" },
	{ id: "orientation", label: "引导配置", description: "Prelude、/start、维护门控" },
	{ id: "appearance", label: "外观", description: "主题、颜色、字体" },
	{ id: "language", label: "语言", description: "界面显示语言" },
	{ id: "workspaces", label: "工作区", description: "固定根目录与显示名称" },
	{ id: "notifications", label: "通知", description: "空闲提醒与免打扰时段" },
	{ id: "about", label: "关于", description: "版本、路径、诊断信息" },
] as const;`;

export const ZH_SETTINGS_TEXT = {
	topTitle: "设置",
	topSubtitle: "配置此本地 Deck 实例",
	envTitle: "环境变量",
	messagingTitle: "消息桥接",
	appearanceTitle: "外观",
	notificationsTitle: "通知",
	orientationTitle: "引导配置",
	notesTitle: "设置说明",
	notesBody:
		"密钥在列表视图中已掩码。请在此处替换值；除非直接使用回环 API，否则请勿明文暴露。",
	sideRail: "设置",
	stubTitle: "尚未构建",
	stubBody: "此区域已预留，以确保设置布局稳定。",
	providersLoading: "正在加载服务商...",
	providersMeta: "服务商",
} as const;

export const SETTINGS_TOP_TITLE = `<div className="meta">${ZH_SETTINGS_TEXT.topTitle}</div>`;
export const SETTINGS_TOP_SUBTITLE = `<div className="text-xs text-ink-3">${ZH_SETTINGS_TEXT.topSubtitle}</div>`;
export const SETTINGS_ENV_TITLE = `<h1 className="text-xl font-semibold tracking-tight">${ZH_SETTINGS_TEXT.envTitle}</h1>`;
export const SETTINGS_MESSAGING_TITLE = `<h1 className="text-xl font-semibold tracking-tight">${ZH_SETTINGS_TEXT.messagingTitle}</h1>`;
export const SETTINGS_APPEARANCE_TITLE = `<h1 className="text-xl font-semibold tracking-tight">${ZH_SETTINGS_TEXT.appearanceTitle}</h1>`;
export const SETTINGS_NOTIFICATIONS_TITLE = `<h1 className="text-xl font-semibold tracking-tight">${ZH_SETTINGS_TEXT.notificationsTitle}</h1>`;
export const SETTINGS_ORIENTATION_TITLE = `<h1 className="text-xl font-semibold tracking-tight">${ZH_SETTINGS_TEXT.orientationTitle}</h1>`;
export const SETTINGS_NOTES_TITLE = `<div className="meta">${ZH_SETTINGS_TEXT.notesTitle}</div>`;
export const SETTINGS_NOTES_BODY = `<p>${ZH_SETTINGS_TEXT.notesBody}</p>`;
export const SETTINGS_SIDE_RAIL = `<div className="p-3 text-xs text-ink-3">${ZH_SETTINGS_TEXT.sideRail}</div>`;
export const SETTINGS_STUB_TITLE = `<h1 className="mt-2 text-xl font-semibold">${ZH_SETTINGS_TEXT.stubTitle}</h1>`;
export const SETTINGS_STUB_BODY = `<p className="mt-1 text-sm text-ink-3">${ZH_SETTINGS_TEXT.stubBody}</p>`;
export const SETTINGS_PROVIDERS_LOADING = `if (loading) {
\t\treturn <div className="font-mono text-2xs text-ink-3">${ZH_SETTINGS_TEXT.providersLoading}</div>;
\t}`;
export const SETTINGS_PROVIDERS_META = `<h2 className="meta">${ZH_SETTINGS_TEXT.providersMeta}</h2>`;

export const SETTINGS_LANG_BRANCH = `) : selected === "appearance" ? (
\t\t\t\t\t\t\t\t<AppearanceSection />
\t\t\t\t\t\t\t) : selected === "language" ? (
\t\t\t\t\t\t\t\t<LanguageSection />
\t\t\t\t\t\t\t) : selected === "notifications" ? (`;

export const LANGUAGE_SECTION_CODE = `function LanguageSection() {
\tconst { locale, setLocale } = useLocale();
\treturn (
\t\t<div className="mx-auto max-w-3xl space-y-4">
\t\t\t<div>
\t\t\t\t<h1 className="text-xl font-semibold tracking-tight">语言</h1>
\t\t\t\t<p className="mt-1 text-sm text-ink-3">切换界面显示语言。设置会保存在当前桌面应用的本地存储中。</p>
\t\t\t</div>
\t\t\t<div className="rounded-md border border-line bg-paper p-4">
\t\t\t\t<div className="space-y-2">
\t\t\t\t\t<button
\t\t\t\t\t\ttype="button"
\t\t\t\t\t\tonClick={() => setLocale("zh-CN")}
\t\t\t\t\t\tclassName={cn(
\t\t\t\t\t\t\t"flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition-colors",
\t\t\t\t\t\t\tlocale === "zh-CN" ? "border-accent bg-accent-soft/20 text-accent" : "border-line hover:bg-paper-2",
\t\t\t\t\t\t)}
\t\t\t\t\t>
\t\t\t\t\t\t<span className="font-medium">简体中文</span>
\t\t\t\t\t\t<span className="font-mono text-2xs text-ink-3">zh-CN</span>
\t\t\t\t\t</button>
\t\t\t\t\t<button
\t\t\t\t\t\ttype="button"
\t\t\t\t\t\tonClick={() => setLocale("en")}
\t\t\t\t\t\tclassName={cn(
\t\t\t\t\t\t\t"flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition-colors",
\t\t\t\t\t\t\tlocale === "en" ? "border-accent bg-accent-soft/20 text-accent" : "border-line hover:bg-paper-2",
\t\t\t\t\t\t)}
\t\t\t\t\t>
\t\t\t\t\t\t<span className="font-medium">English</span>
\t\t\t\t\t\t<span className="font-mono text-2xs text-ink-3">en</span>
\t\t\t\t\t</button>
\t\t\t\t</div>
\t\t\t</div>
\t\t</div>
\t);
}`;

export const SETTINGS_STUB_SECTION_SIG = `function StubSection({ section }: { section: Exclude<SectionId, "env" | "messaging" | "appearance" | "notifications" | "language"> }) {`;

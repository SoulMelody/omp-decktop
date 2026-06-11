export const KB_VIEW_HOOK = `export function KbView() {
	const { t } = useTranslation();
	const [params, setParams] = useSearchParams();`;

export const KB_TOPBAR_HOOK = `function KbTopBar({
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
	return (`;

export const KB_SIDEBAR_HOOK = `function KbSidebar() {
	const { t } = useTranslation();
	return (`;

export const KB_EMPTY_HOOK = `function KbEmpty() {
	const { t } = useTranslation();
	return (`;

export const KB_GRAPH_PREVIEW_EMPTY_HOOK = `function GraphPreviewEmpty() {
	const { t } = useTranslation();
	return (`;

export const KB_WELCOME_HOOK = `function KbWelcome({
	status,
	onInitialized,
}: {
	status: KbStatusResponse;
	onInitialized: () => void;
}) {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);`;

export const KB_INSPECTOR_HOOK = `function KbInspector({
	currentPath,
	onNavigate,
	kbChangeCounter,
}: {
	currentPath: string | undefined;
	onNavigate: (p: string) => void;
	kbChangeCounter: number;
}) {
	const { t } = useTranslation();
	if (!currentPath) {`;

export const KB_COMMAND_PALETTE_HOOK = `function KbCommandPalette({
	open,
	onClose,
	onSelect,
}: {
	open: boolean;
	onClose: () => void;
	onSelect: (path: string) => void;
}) {
	const { t } = useTranslation();`;

// KbTopBar text
export const KB_TOPBAR_TITLE = `<div className="meta">{t("kb.title")}</div>`;
export const KB_TOPBAR_BACK_ARIA = `aria-label={t("kb.backToTree")}`;
export const KB_TOPBAR_FILE_BTN = `{t("kb.fileViewer")}`;
export const KB_TOPBAR_FILE_BTN_TITLE = `title={t("kb.fileViewer")}`;
export const KB_TOPBAR_GRAPH_BTN = `{t("kb.graphViewer")}`;
export const KB_TOPBAR_GRAPH_BTN_TITLE = `title={t("kb.graphViewer")}`;
export const KB_SEARCH_ARIA = `aria-label="搜索知识库 (Ctrl-P)"`;
export const KB_SEARCH_TITLE = `title="搜索 (Ctrl-P / ⌘P)"`;

// KbEmpty text
export const KB_EMPTY_TEXT = `<div className="mt-3 text-sm text-ink-2">{t("kb.pickFile")}</div>`;
export const KB_EMPTY_DETAIL = `<div className="mt-1 max-w-sm text-xs text-ink-3">{t("kb.pickFileDetail")} {t("kb.setExcludeDirsHint")}</div>`;
export const KB_SIDEBAR_HINT = `<div className="mt-0.5 text-xs text-ink-3">
					你的 Karpathy 风格 llm-wiki。点击文件即可打开；wikilink 会在应用内跳转。
				</div>`;

// GraphPreviewEmpty text
export const KB_GRAPH_EMPTY_TEXT = `<div className="mt-3 text-sm text-ink-2">{t("kb.clickNode")}</div>`;
export const KB_GRAPH_EMPTY_DETAIL = `<div className="mt-1 max-w-xs text-xs text-ink-3">{t("kb.clickNodeDetail")}</div>`;

// KbWelcome text
export const KB_WELCOME_TITLE = `<h1 className="text-base font-medium text-ink">{t("kb.setupTitle")}</h1>`;
export const KB_WELCOME_CREATE_BTN = `{t("kb.createStarter")}`;
export const KB_WELCOME_OR_SET_ENV = `<span className="text-2xs text-ink-3">{t("kb.orSetEnv")}</span>`;

// KbSidebar text
export const KB_SIDEBAR_TITLE = `<div className="meta">{t("kb.title")}</div>`;

// KbInspector text
export const KB_INSPECTOR_META = `<div className="meta">{t("kb.inspector")}</div>`;
export const KB_INSPECTOR_HINT = `<p className="text-xs text-ink-3">{t("kb.inspectorHint")}</p>`;
export const KB_INSPECTOR_PICK = `<div className="text-sm text-ink-2">{t("kb.pickFileInspect")}</div>`;
export const KB_INSPECTOR_NO_FM = `{t("kb.noFrontmatter")}`;
export const KB_INSPECTOR_OUTBOUND = `<div className="meta mb-1">{t("kb.outbound")}</div>`;
export const KB_INSPECTOR_NO_OUTBOUND = `<span className="text-2xs text-ink-3">{t("kb.noOutbound")}</span>`;
export const KB_INSPECTOR_BACKLINKS = `<div className="meta mb-1">{t("kb.backlinks")}</div>`;
export const KB_INSPECTOR_NO_BACKLINKS = `<span className="text-2xs text-ink-3">{t("kb.noBacklinks")}</span>`;
export const KB_INSPECTOR_ORPHAN = `<span className="text-2xs text-ink-3">{t("kb.orphan")}</span>`;
export const KB_INSPECTOR_EDIT = `{t("kb.edit")}`;
export const KB_DISCARD_CONFIRM = `"放弃未保存的更改？"`;
export const KB_SAVE_TITLE = `title="保存 (Ctrl-S)"`;
export const KB_SAVE_LABEL = `保存`;
export const KB_DISCARD_TITLE = `title="放弃更改 (Esc)"`;
export const KB_CANCEL_LABEL = `取消`;
export const KB_EDIT_TITLE = `title="编辑（或点击正文任意位置）"`;
export const KB_EDIT_LABEL = `编辑`;
export const KB_CLOSE_PREVIEW_TITLE = `title="关闭预览"`;
export const KB_CLOSE_PREVIEW_ARIA = `aria-label="关闭预览"`;
export const KB_PATH_ENDS_WITH_MD = `"路径必须以 .md 结尾"`;
export const KB_LOADING_BACKLINKS = `<div className="text-2xs text-ink-3">
				<Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" /> 正在加载反向链接…
			</div>`;
export const KB_BACKLINKS_EMPTY = `<div className="text-2xs text-ink-3">无反向链接</div>`;
export const KB_BACKLINKS_COUNT = `<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">
				反向链接 ({backlinks.length})
			</div>`;
export const KB_TAGS_LABEL = `<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">标签</div>`;
export const KB_TAG_FILTER_TITLE = `title="点击筛选会跳转到 T-40"`;

// KbCommandPalette
export const KB_SEARCH_PLACEHOLDER = `placeholder={t("kb.search")}`;
export const KB_PALETTE_HOOK = `function KbCommandPalette({
	open,
	onClose,
	onSelect,
}: {
	open: boolean;
	onClose: () => void;
	onSelect: (path: string) => void;
}) {
	const { t } = useTranslation();`;

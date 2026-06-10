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

// KbEmpty text
export const KB_EMPTY_TEXT = `<div className="mt-3 text-sm text-ink-2">{t("kb.pickFile")}</div>`;
export const KB_EMPTY_DETAIL = `<div className="mt-1 max-w-sm text-xs text-ink-3">{t("kb.pickFileDetail")} {t("kb.setExcludeDirsHint")}</div>`;

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

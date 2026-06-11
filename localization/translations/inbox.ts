export const INBOX_KIND_LABEL = `const KIND_LABEL: Record<InboxKind, string> = {
	email: "inbox.kinds.emails",
	ticket: "inbox.kinds.tickets",
	idea: "inbox.kinds.ideas",
	decision: "inbox.kinds.decisions",
	investigation: "inbox.kinds.investigations",
	capture: "inbox.kinds.captures",
};`;

export const INBOX_VIEW_HOOK = `export function InboxView() {
	const { t } = useTranslation();
	const setInspectorOpen = useStore((s) => s.setInspectorOpen);`;

const INBOX_I18N_TITLE = `{filter === "all" ? t("inbox.title") : t(KIND_LABEL[filter])}`;
export { INBOX_I18N_TITLE as INBOX_HEADER_ALL };

export const INBOX_LOADING = `<EmptyHint>{t("common.status.loading")}</EmptyHint>`;

export const INBOX_EMPTY_ALL = `{filter === "all" ? t("inbox.empty") : t("inbox.noItems", { kind: t(KIND_LABEL[filter]).toLowerCase() })}`;

export const INBOX_SIDEBAR_HOOK = `function InboxSidebar({
	counts,
	filter,
	setFilter,
	includeProcessed,
	setIncludeProcessed,
	onCompose,
}: {
	counts: Record<string, number>;
	filter: Filter;
	setFilter: (f: Filter) => void;
	includeProcessed: boolean;
	setIncludeProcessed: (v: boolean) => void;
	onCompose: () => void;
}) {
	const { t } = useTranslation();`;

export const INBOX_SIDEBAR_CAPTURE = `>{t("inbox.capture")}<`;

export const INBOX_SIDEBAR_FILTER = `<div className="meta mb-1.5">{t("inbox.filter")}</div>`;

export const INBOX_SIDEBAR_KIND_LABEL = `label={t(KIND_LABEL[k])}`;

export const INBOX_SIDEBAR_SHOW_PROCESSED = `<span>{t("inbox.showProcessed")}</span>`;

export const INBOX_LIST_ROW_HOOK = `function ListRow({
	item,
	active,
	onClick,
}: {
	item: InboxItem;
	active: boolean;
	onClick: () => void;
}) {
	const { t } = useTranslation();`;

export const INBOX_LIST_ROW_ARIA = `aria-label={item.processedAt ? t("inbox.markProcessed") : t("inbox.markUnprocessed")}`;

export const INBOX_READER_HOOK = `function ReaderPane({
	item,
	onOpenInChat,
	onPromote,
	onProcess,
	onDelete,
	onPatch,
	onClose,
}: {
	item: InboxItem;
	onOpenInChat: () => void;
	onPromote: () => void;
	onProcess: () => void;
	onDelete: () => void;
	onPatch: (body: Parameters<typeof inboxApi.update>[1]) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();`;

export const INBOX_READER_KIND_OPTION = `{t(KIND_LABEL[k])}`;

export const INBOX_READER_MARK_LABEL = `label={item.processedAt ? t("inbox.markUnprocessed") : t("inbox.markProcessed")}`;

export const INBOX_READER_DELETE_LABEL = `label={t("common.actions.delete")}`;

export const INBOX_READER_PROMOTE_LABEL = `label={t("inbox.promoteToTask")}`;

export const INBOX_READER_OPEN_IN_CHAT_HINT = `title={t("inbox.openInChatHint")}`;

export const INBOX_READER_OPEN_IN_CHAT = `<span>{t("inbox.openInChat")}</span>`;

export const INBOX_READER_CLOSE_LABEL = `label={t("common.actions.close")}`;

export const INBOX_READER_UNTITLED = `placeholder={t("inbox.untitled")}`;

export const INBOX_READER_ADD_NOTES = `placeholder={t("inbox.addNotes")}`;

export const INBOX_COMPOSE_HOOK = `function ComposePane({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: (item: InboxItem) => void;
}) {
	const { t } = useTranslation();`;

export const INBOX_COMPOSE_KIND_OPTION = `{t(KIND_LABEL[k])}`;

const INBOX_COMPOSE_CANCEL_TEXT = `>{t("common.actions.cancel")}<`;
export { INBOX_COMPOSE_CANCEL_TEXT as INBOX_COMPOSE_CANCEL };

const INBOX_COMPOSE_CAPTURE_TEXT = `>{t("inbox.capture")}<`;
export { INBOX_COMPOSE_CAPTURE_TEXT as INBOX_COMPOSE_CAPTURE };

export const INBOX_COMPOSE_TITLE_PLACEHOLDER = `placeholder={t("inbox.titlePlaceholder")}`;

export const INBOX_COMPOSE_SAVE_HINT = `{t("inbox.saveHint")}`;

export const INBOX_COMPOSE_BODY_PLACEHOLDER = `placeholder={t("inbox.bodyPlaceholder")}`;

export const INBOX_EMPTY_READER_HOOK = `function EmptyReader({ onCompose }: { onCompose: () => void }) {
	const { t } = useTranslation();`;

export const INBOX_EMPTY_READER_DETAIL = `<div className="text-sm text-ink-3">{t("inbox.emptyDetail")}</div>`;

const INBOX_EMPTY_READER_CAPTURE_TEXT = `>{t("inbox.capture")}<`;
export { INBOX_EMPTY_READER_CAPTURE_TEXT as INBOX_EMPTY_READER_CAPTURE };

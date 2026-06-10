export const MARKETPLACE_VIEW_HOOK = `export function MarketplaceView() {
\tconst { t } = useTranslation();
\tconst [data, setData] = useState<ListMarketplaceResponse | null>(null);`;

export const MARKETPLACE_SIDEBAR_HOOK = `function MarketplaceSidebar({
\tsources,
\tcounts,
\tscope,
\tonScope,
\tmarketplaceFilter,
\tonMarketplaceFilter,
\tonAdd,
\tonRefresh,
\trefreshing,
\tonRemoveSource,
}: {
\tsources: MarketplaceSource[];
\tcounts: { all: number; installed: number; available: number };
\tscope: ScopeFilter;
\tonScope: (s: ScopeFilter) => void;
\tmarketplaceFilter: string | "all";
\tonMarketplaceFilter: (s: string | "all") => void;
\tonAdd: () => void;
\tonRefresh: () => void;
\trefreshing: boolean;
\tonRemoveSource: (name: string) => void;
}) {
\tconst { t } = useTranslation();
\treturn (`;

export const EMPTY_SOURCES_HOOK = `function EmptySources({ onAdd, onAdded }: { onAdd: () => void; onAdded: () => void }) {
\tconst { t } = useTranslation();
\tconst [adding, setAdding] = useState<string | undefined>();`;

export const ENTRY_CARD_HOOK = `function EntryCard({
\tentry,
\tisSelected,
\tbusy,
\tonSelect,
\tonInstall,
\tonUninstall,
}: {
\tentry: MarketplaceCatalogEntry;
\tisSelected: boolean;
\tbusy: boolean;
\tonSelect: () => void;
\tonInstall: () => void;
\tonUninstall: () => void;
}) {
\tconst { t } = useTranslation();
\tconst caps = [`;

export const MARKETPLACE_INSPECTOR_HOOK = `function MarketplaceInspector({ entry }: { entry: MarketplaceCatalogEntry | undefined }) {
\tconst { t } = useTranslation();
\tif (!entry) {`;

export const ADD_MARKETPLACE_MODAL_HOOK = `export function AddMarketplaceModalHost({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
\tconst { t } = useTranslation();
\tconst [source, setSource] = useState("");`;

export const MARKETPLACE_TITLE = `<div className="meta">{t("marketplace.title")}</div>`;
export const MARKETPLACE_LOADING = `t("common.status.loading")`;
export const MARKETPLACE_SEARCH_PLACEHOLDER = `placeholder={t("marketplace.searchPlaceholder")}`;
export const MARKETPLACE_CATALOG_LOADING = `<div className="px-3 py-6 text-center text-sm text-ink-3">{t("common.status.loading")}</div>`;
export const MARKETPLACE_NO_MATCHES = `{t("marketplace.noMatches")}`;
export const MARKETPLACE_CATALOG_LABEL = `<div className="meta">{t("marketplace.catalog")}</div>`;
export const MARKETPLACE_ALL_LABEL = `label={t("marketplace.all")}`;
export const MARKETPLACE_INSTALLED_LABEL = `label={t("marketplace.installed")}`;
export const MARKETPLACE_AVAILABLE_LABEL = `label={t("marketplace.available")}`;
export const MARKETPLACE_SOURCES_LABEL = `<div className="meta">{t("marketplace.sources")}</div>`;
export const MARKETPLACE_REFRESH_TITLE = `title={t("common.actions.refresh")}`;
export const MARKETPLACE_ADD_TITLE = `title={t("marketplace.addMarketplace")}`;
export const MARKETPLACE_ALL_MARKETPLACES = `<span className="truncate">{t("marketplace.allMarketplaces")}</span>`;
export const MARKETPLACE_NO_MARKETPLACES = `<div className="meta">{t("marketplace.noMarketplaces")}</div>`;
export const MARKETPLACE_NO_MARKETPLACES_HINT = `{t("marketplace.noMarketplacesHint")}`;
export const MARKETPLACE_SUGGESTED = `<div className="meta">{t("marketplace.suggested")}</div>`;
export const MARKETPLACE_PLUGIN_DETAILS = `<div className="meta">{t("marketplace.pluginDetails")}</div>`;
export const MARKETPLACE_PLUGIN_DETAILS_HINT = `<p>{t("marketplace.pluginDetailsHint")}</p>`;
export const MARKETPLACE_ADD_MARKETPLACE_MODAL_TITLE = `<div className="meta">{t("marketplace.addMarketplace")}</div>`;
export const MARKETPLACE_CANCEL = `{t("common.actions.cancel")}`;
export const MARKETPLACE_ADD_BTN = `{t("common.actions.add")}`;
export const MARKETPLACE_INSTALLED_BADGE = `{t("common.status.installed")}`;
export const MARKETPLACE_UNINSTALL_TITLE = `title={t("common.actions.uninstall")}`;
export const MARKETPLACE_INSTALL_BTN = `{t("common.actions.install")}`;

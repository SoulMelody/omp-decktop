export const SKILLS_I18N = {
	title: "skills.title",
	searchPlaceholder: "skills.searchPlaceholder",
	noSkills: "skills.noSkills",
	noSkillsHint: "skills.noSkillsHint",
	noMatches: "skills.noMatches",
	noMatchesHint: "skills.noMatchesHint",
	source: "skills.source",
	level: "skills.level",
	pickSkill: "skills.pickSkill",
	inspectorHint: "skills.inspectorHint",
	fromPlugin: "skills.fromPlugin",
	loading: "common.status.loading",
} as const;

export const ZH_SKILLS_TEXT = {
	hidden: "隐藏",
	backToList: "返回技能列表",
	inspector: "检查器",
	enabledYes: "是",
	enabledHidden: "隐藏 (frontmatter)",
	bundledFiles: "打包文件",
	reachableOnDemand: "按需可达 — 不会自动注入到 Agent 上下文中。",
} as const;

export const SKILLS_VIEW_HOOK = `export function SkillsView() {
	const { t } = useTranslation();
	const [data, setData] = useState<ListSkillsResponse | null>(null);`;

export const SKILLS_DETAIL_PANE_HOOK = `function SkillDetailPane({
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
	const { t } = useTranslation();
	return (`;

export const SKILLS_EMPTY_STATE_HOOK = `function EmptyState({ total }: { total: number }) {
	const { t } = useTranslation();
	return (`;

export const SKILLS_SIDEBAR_HOOK = `function SkillsSidebar({
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
	const { t } = useTranslation();
	const providers = useMemo(`;

export const SKILLS_INSPECTOR_HOOK = `function SkillInspector({
	skill,
	detail,
}: {
	skill: SkillSummary | undefined;
	detail: SkillDetailResponse | null;
}) {
	const { t } = useTranslation();
	if (!skill) {`;

export const SKILLS_TITLE_META = `<div className="meta">{t("${SKILLS_I18N.title}")}</div>`;
export const SKILLS_LOADING_TEXT = `t("${SKILLS_I18N.loading}")`;
export const SKILLS_SEARCH_PLACEHOLDER = `placeholder={t("${SKILLS_I18N.searchPlaceholder}")}`;
export const SKILLS_LOADING_SKILLS = `<div className="px-3 py-6 text-center text-sm text-ink-3">{t("${SKILLS_I18N.loading}")}</div>`;
export const SKILLS_FROM_PLUGIN = `<span className="text-ink-4">{t("${SKILLS_I18N.fromPlugin}")}</span>`;
export const SKILLS_LOADING_SKILL_MD = `{t("${SKILLS_I18N.loading}")}`;
export const SKILLS_EMPTY_TEXT = `{total === 0 ? t("${SKILLS_I18N.noSkills}") : t("${SKILLS_I18N.noMatches}")}`;
export const SKILLS_EMPTY_HINT = `{total === 0
	? t("${SKILLS_I18N.noSkillsHint}")
	: t("${SKILLS_I18N.noMatchesHint}")}`;
export const SKILLS_SOURCE_LABEL = `<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">{t("${SKILLS_I18N.source}")}</div>`;
export const SKILLS_LEVEL_LABEL = `<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">{t("${SKILLS_I18N.level}")}</div>`;
export const SKILLS_INSPECTOR_HINT = `<div className="mt-0.5 text-xs text-ink-3">{t("${SKILLS_I18N.inspectorHint}")}</div>`;
export const SKILLS_PICK_SKILL = `<div className="px-3 py-4 text-xs text-ink-3">{t("${SKILLS_I18N.pickSkill}")}</div>`;
export const SKILLS_INSPECTOR_META = `<div className="meta">${ZH_SKILLS_TEXT.inspector}</div>`;
export const SKILLS_BACK_ARIA = `aria-label="${ZH_SKILLS_TEXT.backToList}"`;
export const SKILLS_ENABLED_VALUES = `{skill.enabled ? "${ZH_SKILLS_TEXT.enabledYes}" : "${ZH_SKILLS_TEXT.enabledHidden}"}`;

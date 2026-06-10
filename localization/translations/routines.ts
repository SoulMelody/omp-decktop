export const ROUTINES_VIEW_HOOK = `export function RoutinesView() {
	const { t } = useTranslation();`;

export const ROUTINES_INDEX_HOOK = `function RoutinesIndex({
	routines,
	metrics,
	loading,
	error,
	onNew,
	onOpen,
	onToggleEnabled,
	onRunNow,
}: {
	routines: Routine[];
	metrics: Record<string, RoutineMetrics>;
	loading: boolean;
	error: string | undefined;
	onNew: () => void;
	onOpen: (r: Routine) => void;
	onToggleEnabled: (r: Routine) => void;
	onRunNow: (r: Routine) => void;
}) {
	const { t } = useTranslation();`;

export const ROUTINE_LIST_ITEM_HOOK = `function RoutineListItem({
	routine,
	metrics,
	onOpen,
	onToggleEnabled,
	onRunNow,
}: {
	routine: Routine;
	metrics: RoutineMetrics | undefined;
	onOpen: (r: Routine) => void;
	onToggleEnabled: (r: Routine) => void;
	onRunNow: (r: Routine) => void;
}) {
	const { t } = useTranslation();`;

export const ROUTINES_SIDEBAR_HOOK = `function RoutinesSidebar({
	routines,
	onNew,
	onInstallTemplate,
}: {
	routines: Routine[];
	onNew: () => void;
	onInstallTemplate: (slug: string) => void;
}) {
	const { t } = useTranslation();`;

export const EDITOR_SIDEBAR_HOOK = `function EditorSidebar({ onBack, onNew }: { onBack: () => void; onNew: () => void }) {
	const { t } = useTranslation();`;

export const INDEX_INSPECTOR_HOOK = `function IndexInspector({ routines, metrics }: { routines: Routine[]; metrics: Record<string, RoutineMetrics> }) {
	const { t } = useTranslation();`;

export const ROUTINES_TITLE = `<div className="meta">{t("routines.title")}</div>`;

export const ROUTINES_SUMMARY = `{t("routines.total", { count: routines.length })} · {t("routines.enabled", { count: routines.filter((r) => r.enabled).length })} · {t("routines.pipelines", { count: routines.filter((r) => r.specVersion === 1).length })}`;

export const ROUTINES_NEW_ROUTINE = `>{t("routines.newRoutine")}<`;

export const ROUTINES_LOADING = `<div className="flex flex-1 items-center justify-center text-sm text-ink-3">{t("common.status.loading")}</div>`;

export const ROUTINES_NO_ROUTINES = `<div className="meta mb-1.5">{t("routines.noRoutines")}</div>`;

export const ROUTINES_NO_ROUTINES_HINT = `<p className="text-sm text-ink-2">{t("routines.noRoutinesHint")}</p>`;

export const ROUTINES_LOADING_ROUTINE = `<div className="flex h-full items-center justify-center px-6 text-center font-mono text-2xs text-ink-3">{t("routines.loadingRoutine")}</div>`;

export const ROUTINES_PIPELINE_CHIP = `{t("routines.pipelines")}`;

export const ROUTINES_STEPS = `{t("routines.steps", { count: stepCount })}`;

export const ROUTINES_PERCENT_OK = `{t("routines.percentOk", { pct: okPct })}`;

export const ROUTINES_MANUAL = `{routine.cron ? <span>{routine.cron}</span> : <span>{t("common.status.manual")}</span>}`;

export const ROUTINES_NEXT = `{routine.nextRunAt ? <span>{t("routines.next")} {new Date(routine.nextRunAt).toLocaleString()}</span> : null}`;

export const ROUTINES_LAST = `{routine.lastRunAt ? <span>{t("routines.last")} {new Date(routine.lastRunAt).toLocaleString()}</span> : null}`;

export const ROUTINES_RUN_BTN = `>{t("common.actions.run")}<`;

export const ROUTINES_RUN_NOW_TITLE = `title={t("common.actions.runNow")}`;

export const ROUTINES_ON_OFF = `{routine.enabled ? t("common.status.enabled") : t("common.status.disabled")}`;

export const ROUTINES_ENABLE_DISABLE_TITLE = `title={routine.enabled ? t("common.actions.disable") : t("common.actions.enable")}`;

export const ROUTINES_SCHEDULE_LABEL = `<div className="meta mb-1.5">{t("routines.schedule")}</div>`;

export const ROUTINES_STAT_ENABLED = `label={t("routines.enabled")}`;

export const ROUTINES_STAT_DISABLED = `label={t("common.status.disabled")}`;

export const ROUTINES_STAT_PIPELINES = `label={t("routines.pipelines")}`;

export const ROUTINES_TEMPLATES_LABEL = `<div className="meta mb-1.5">{t("routines.templates")}</div>`;

export const ROUTINES_TEMPLATES_LOADING = `<div className="font-mono text-2xs text-ink-3">{t("common.status.loading")}</div>`;

export const ROUTINES_NO_TEMPLATES = `<div className="font-mono text-2xs text-ink-3">{t("routines.noTemplates")}</div>`;

export const ROUTINES_TEMPLATE_MAP = "templates.map((tpl) => (";

export const ROUTINES_TEMPLATE_STEPS_TRIGGERS = `{t("routines.steps", { count: tpl.steps })} · {t("routines.triggers", { count: tpl.triggers })}`;

export const ROUTINES_CRON_LABEL = `<div className="meta mb-1.5">{t("routines.cronFormat")}</div>`;

export const ROUTINES_ALL_ROUTINES = `>{t("routines.allRoutines")}<`;

export const ROUTINES_EDITOR_LABEL = `<div className="meta mb-1.5">{t("routines.editor")}</div>`;

export const ROUTINES_EDITOR_NOTE = `<p className="text-xs leading-relaxed text-ink-3">{t("routines.editorNote")}</p>`;

export const ROUTINES_OVERVIEW_LABEL = `<div className="meta mb-2">{t("routines.overview")}</div>`;

export const ROUTINES_TOTAL_ROUTINES = `<span>{t("routines.totalRoutines")}</span>`;

export const ROUTINES_RUNS_RECORDED = `<span>{t("routines.runsRecorded")}</span>`;

export const ROUTINES_NEXT_FIRE_LABEL = `<div className="meta mb-2">{t("routines.nextFire")}</div>`;

export const ROUTINES_NO_ENABLED_SCHEDULES = `<div className="font-mono text-2xs text-ink-3">{t("routines.noEnabledSchedules")}</div>`;

export const ROUTINES_CREATE_LABEL = `<div className="meta mb-1.5">{t("common.actions.create")}</div>`;

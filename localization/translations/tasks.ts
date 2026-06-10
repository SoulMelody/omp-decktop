export const TASKS_HOOK = `export function TasksView() {
\tconst { t } = useTranslation();
\tconst navigate = useNavigate();`;

export const TASKS_TITLE = `<div className="meta">{t("tasks.title")}</div>`;
export const TASKS_TASK_COUNT = `{t("tasks.taskCount", { count: tasks.length })} · {t("tasks.columnCount", { count: states.length })}`;
export const TASKS_EDIT_COLUMNS_TITLE = `title={t("tasks.editColumns")}`;
export const TASKS_COLUMNS_BTN = `>{t("tasks.columns")}<`;
export const TASKS_LOADING = `>{t("common.status.loading")}<`;
export const TASKS_NO_COLUMNS = `>{t("tasks.noColumns")}<`;

export const TASKS_EMPTY_INSPECTOR_HOOK = `function EmptyInspector() {
\tconst { t } = useTranslation();
\treturn (`;

export const TASKS_EMPTY_INSPECTOR_TEXT = `>{t("tasks.emptyInspector")}<`;

export const TASKS_SIDEBAR_HOOK = `function TasksSidebar({ tasks, states }: { tasks: Task[]; states: TaskState[] }) {
\tconst { t } = useTranslation();
\treturn (`;

export const TASKS_OVERVIEW = `<div className="meta mb-1.5">{t("tasks.overview")}</div>`;
export const TASKS_TIPS = `<div className="meta mb-1.5">{t("tasks.tips")}</div>`;
export const TASKS_TIP1 = `<li>{t("tasks.tip1")}</li>`;
export const TASKS_TIP2 = `<li>{t("tasks.tip2")}</li>`;
export const TASKS_TIP3 = `<li>{t("tasks.tip3")}</li>`;

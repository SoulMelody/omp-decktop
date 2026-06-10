export const ONBOARDING_VIEW_HOOK = `export function OnboardingView() {
	const { t } = useTranslation();
	const navigate = useNavigate();`;

export const ONBOARDING_HEADER = `<div className="meta text-ink-3">{t("onboarding.header")}</div>`;

export const ONBOARDING_STEP_ORDER = `const STEP_ORDER: ReadonlyArray<{ key: StepKey; title: string }> = [
	{ key: "welcome", title: t("onboarding.steps.welcome") },
	{ key: "kb", title: t("onboarding.steps.knowledgeBase") },
	{ key: "provider", title: t("onboarding.steps.connectProvider") },
	{ key: "autostart", title: t("onboarding.steps.sessionGreeting") },
	{ key: "done", title: t("onboarding.steps.allSet") },
];`;

export const ONBOARDING_SKIP_SETUP = `{t("onboarding.skipSetup")}`;
export const ONBOARDING_SKIP_SETUP_TITLE = `title={t("onboarding.skipSetup")}`;

export const ONBOARDING_ERROR_PREFIX = `{t("onboarding.errorPrefix")}`;

// Step 1 — Welcome
export const STEP1_WELCOME_HOOK = `function Step1Welcome({ onNext }: { onNext: () => void }) {
	const { t } = useTranslation();
	return (`;

export const STEP1_WELCOME_TITLE = `<h1 className="text-xl font-semibold text-ink">{t("onboarding.welcomeTitle")}</h1>`;

// Step 2 — KB
export const STEP2_KB_HOOK = `function Step2Kb({
	state,
	onRefresh,
	onNext,
}: {
	state: OnboardingState;
	onRefresh: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
	return (`;

// Step 3 — Provider
export const STEP3_PROVIDER_HOOK = `function Step3Provider({
	state,
	onRefresh,
	onNext,
}: {
	state: OnboardingState;
	onRefresh: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
	return (`;

// Step 4 — Auto-start
export const STEP4_AUTOSTART_HOOK = `function Step4AutoStart({
	state,
	onRefresh,
	onNext,
}: {
	state: OnboardingState;
	onRefresh: () => void;
	onNext: () => void;
}) {
	const { t } = useTranslation();
	return (`;

// Step 5 — Done
export const STEP5_DONE_HOOK = `function Step5Done({ onFinish }: { onFinish: () => void }) {
	const { t } = useTranslation();
	return (`;

export const ONBOARDING_STEP_WELCOME = `<span className="hidden sm:inline">{t("onboarding.steps.welcome")}</span>`;
export const ONBOARDING_STEP_KB = `<span className="hidden sm:inline">{t("onboarding.steps.knowledgeBase")}</span>`;
export const ONBOARDING_STEP_PROVIDER = `<span className="hidden sm:inline">{t("onboarding.steps.connectProvider")}</span>`;
export const ONBOARDING_STEP_AUTOSTART = `<span className="hidden sm:inline">{t("onboarding.steps.sessionGreeting")}</span>`;
export const ONBOARDING_STEP_DONE = `<span className="hidden sm:inline">{t("onboarding.steps.allSet")}</span>`;

export const ONBOARDING_OPEN_CHAT = `{t("onboarding.openChat")}`;
export const ONBOARDING_SKIP_STEP = `{t("onboarding.skipStep")}`;
export const ONBOARDING_SKIP_LATER = `{t("onboarding.skipLater")}`;
export const ONBOARDING_SKIP_GREETING = `{t("onboarding.skipGreeting")}`;
export const ONBOARDING_ALL_SET_TITLE = `<h2 className="text-xl font-semibold text-ink">{t("onboarding.allSetTitle")}</h2>`;

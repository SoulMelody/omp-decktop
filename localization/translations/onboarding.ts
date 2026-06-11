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

export const STEP1_WELCOME_TITLE = `<h1 className="text-2xl font-semibold text-ink">欢迎使用 omp·deck</h1>`;
export const STEP1_WELCOME_INTRO = `<p className="mt-2 text-sm text-ink-2">
					面向 AI 编码代理的本地驾驶舱：多会话对话、看板、例程、知识库，全部仅在这台机器上回环运行。
				</p>`;
export const STEP1_WELCOME_STEPS_LEAD = `<p>接下来的几步会：</p>`;
export const STEP1_WELCOME_STEP_KB = `<span>建立代理可读取的知识库</span>`;
export const STEP1_WELCOME_STEP_PROVIDER = `<span>连接模型服务商，让对话真正可用</span>`;
export const STEP1_WELCOME_STEP_GREETING = `<span>可选地为每个新会话启用自动问候</span>`;
export const STEP1_WELCOME_FOOTNOTE = `<p className="mt-3 text-2xs text-ink-3">
					每一步都可以跳过，之后也能随时在 设置 → 引导 中重新运行本向导。
				</p>`;
export const STEP1_WELCOME_CTA = `开始使用 <ChevronRight className="ml-1 h-4 w-4" />`;

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
export const STEP2_KB_TITLE = `<h1 className="text-xl font-semibold text-ink">知识库</h1>`;
export const STEP2_KB_INTRO = `<p className="mt-2 text-sm text-ink-2">
					omp·deck 的 <code className="font-mono">/kb</code> 视图是一个纯文本可移植 wiki，代理会在这里读写长期记忆。
					现在先建好它，代理后面就有地方沉淀上下文。
				</p>`;
export const STEP2_KB_LOCATION = `<div className="meta mb-1.5 text-ink-3">位置</div>`;
export const STEP2_KB_CHANGE = `更改…`;
export const STEP2_KB_EXISTS = `"已存在 - 脚手架只会补齐缺失的初始文件。"`; 
export const STEP2_KB_WILL_CREATE = `"将创建 README 与 system/ 初始文件，供代理在会话开始时读取。"`; 
export const STEP2_KB_PATH_CHANGED = `<span className="ml-1 text-warn">
							路径与服务端当前解析出的根目录不同；重启 Deck 后才会完全生效。
						</span>`;
export const STEP2_KB_SCAFFOLDING = `"正在初始化…"`; 
export const STEP2_KB_CREATE = `"创建知识库"`; 
export const STEP2_KB_READY = `准备就绪`;
export const STEP_CONTINUE = `继续 <ChevronRight className="ml-1 h-4 w-4" />`;

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
export const STEP3_PROVIDER_TITLE = `<h1 className="text-xl font-semibold text-ink">连接服务商</h1>`;
export const STEP3_PROVIDER_INTRO = `<p className="mt-2 text-sm text-ink-2">
						选择代理连接模型的方式。你已经在付费的订阅（Claude Pro/Max、ChatGPT Plus/Pro）最省心，不需要自己管理 API Key；
						OpenRouter 则适合按量付费。
					</p>`;
export const STEP3_PROVIDER_CLAUDE_SUBTITLE = `"通过 claude.ai 的 OAuth 订阅"`;
export const STEP3_PROVIDER_CHATGPT_SUBTITLE = `"通过 chatgpt.com 的 OAuth 订阅"`;
export const STEP3_PROVIDER_OPENROUTER_SUBTITLE = `<div className="mt-0.5 text-xs text-ink-3">
								按量计费的 API Key。一个账户，对接数百个模型。
							</div>`;
export const STEP3_PROVIDER_CONNECTED = `已连接`;
export const STEP3_PROVIDER_SAVING = `"保存中…"`; 
export const STEP3_PROVIDER_SAVE_KEY = `"保存 Key"`; 
export const STEP3_PROVIDER_GET_KEY = `获取 Key <ExternalLink className="h-3 w-3" />`;
export const STEP3_PROVIDER_OTHER_HINT = `<p className="text-2xs text-ink-3">
					如果要配置其他服务商（OpenAI 官方 API、Anthropic API、Google、Groq、xAI 等），可在完成引导后前往
					<a href="/settings" className="underline"> 设置 → Providers</a>。
				</p>`;

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
export const STEP4_AUTOSTART_TITLE = `<h1 className="text-xl font-semibold text-ink">会话问候</h1>`;
export const STEP4_AUTOSTART_INTRO = `<p className="mt-2 text-sm text-ink-2">
					创建新对话时，代理可以自动读取知识库、查询本地 API 中的任务 / 收件箱 / 例程状态，并先做一次当前情况概览。
					每个会话只触发一次。
				</p>`;
export const STEP4_AUTOSTART_PREVIEW = `预览代理在每个新会话中会执行的内容`;
export const STEP4_AUTOSTART_ENABLING = `"启用中…"`; 
export const STEP4_AUTOSTART_ENABLE = `"启用自动问候"`; 
export const STEP4_AUTOSTART_ENABLED = `已启用`;

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
export const ONBOARDING_ALL_SET_TITLE = `<h1 className="text-xl font-semibold text-ink">设置完成</h1>`;
export const STEP5_DONE_INTRO = `<p className="mt-2 text-sm text-ink-2">
					你的 Deck 已经带有一个 <code className="font-mono">T-1 Welcome</code> 任务，会带你熟悉各个界面；之后随时都能在任务页重新打开。
				</p>`;
export const STEP5_DONE_NEXT = `<p>接下来建议：</p>`;
export const STEP5_DONE_NEXT_CHAT = `<li>先发一条消息，确认服务商连接是否正常。</li>`;
export const STEP5_DONE_NEXT_TASKS = `<li>切到 <strong>任务</strong> 页，阅读 <strong>T-1</strong> 获取更完整的导览。</li>`;
export const STEP5_DONE_NEXT_MARKETPLACE = `<li>
						访问 <a href="/marketplace" className="underline">市场</a> 安装插件 / 技能（推荐：claude-plugins-official）。
					</li>`;

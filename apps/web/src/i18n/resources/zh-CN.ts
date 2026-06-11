/**
 * Chinese (Simplified) translation resource.
 *
 * Mirrors the English key structure. Keys not present here fall back to
 * English automatically via i18next fallback.
 */

const zhCN = {
	// ── 通用 ────────────────────────────────────────────────────────────
	common: {
		actions: {
			save: "保存",
			cancel: "取消",
			close: "关闭",
			dismiss: "忽略",
			replace: "替换",
			unset: "清除",
			reload: "重新加载",
			reset: "恢复默认",
			enable: "启用",
			disable: "禁用",
			start: "启动",
			stop: "停止",
			restart: "重启",
			login: "登录",
			signOut: "退出登录",
			create: "创建",
			add: "添加",
			edit: "编辑",
			delete: "删除",
			run: "运行",
			runNow: "立即运行",
			install: "安装",
			uninstall: "卸载",
			search: "搜索",
			refresh: "刷新",
			skip: "跳过",
			continue: "继续",
			getStarted: "开始使用",
			change: "更改…",
		},
		status: {
			loading: "加载中...",
			enabled: "已启用",
			disabled: "已禁用",
			muted: "已静音",
			active: "当前",
			pinned: "已固定",
			default: "默认",
			override: "自定义",
			unsavedChanges: "未保存的更改",
			notBuiltYet: "尚未构建",
			connected: "已连接",
			ready: "就绪",
			installed: "已安装",
			manual: "手动",
		},
	},

	// ── 导航 ────────────────────────────────────────────────────────────
	nav: {
		chat: "对话",
		tasks: "任务",
		routines: "例程",
		inbox: "收件箱",
		marketplace: "市场",
		skills: "技能",
		knowledge: "知识库",
		integrations: "集成",
		settings: "设置",
	},

	// ── 布局 ────────────────────────────────────────────────────────────
	layout: {
		toggleSessions: "切换会话面板",
		toggleInspector: "切换检查器",
		closePanels: "关闭面板",
		inspector: "检查器",
		expandAllToolCards: "展开所有工具卡片",
		collapseAllToolCards: "折叠所有工具卡片",
	},

	// ── 侧边栏 (对话) ──────────────────────────────────────────────────
	sidebar: {
		workspace: "工作区",
		allWorkspaces: "(所有工作区)",
		newSession: "新会话",
		sessions: "会话",
		noSessions: "暂无会话。",
		refreshWorkspaces: "刷新工作区",
		refreshSessions: "刷新会话",
	},

	// ── 设置 ────────────────────────────────────────────────────────────
	settings: {
		title: "设置",
		subtitle: "配置此本地 Deck 实例",
		sections: {
			env: { label: "环境变量", description: "进程及 Deck 管理的变量" },
			providers: { label: "服务商", description: "OAuth 登录与 API 密钥状态" },
			messaging: { label: "消息桥接", description: "Telegram 及未来的聊天桥接" },
			orientation: { label: "引导配置", description: "Prelude、/start、维护门控" },
			appearance: { label: "外观", description: "主题、颜色、字体" },
			language: { label: "语言", description: "界面显示语言" },
			workspaces: { label: "工作区", description: "固定根目录与显示名称" },
			notifications: { label: "通知", description: "空闲提醒与免打扰时段" },
			about: { label: "关于", description: "版本、路径、诊断信息" },
		},
		notes: {
			title: "设置说明",
			body: "密钥在列表视图中已掩码。请在此处替换值；除非直接使用回环 API，否则请勿明文暴露。",
		},
		stub: {
			heading: "尚未构建",
			body: "此区域已预留，以确保设置布局稳定。",
		},
	},

	// ── 任务 / 看板 ─────────────────────────────────────────────────────
	tasks: {
		title: "看板",
		taskCount: "{{count}} 个任务",
		taskCount_plural: "{{count}} 个任务",
		columnCount: "{{count}} 列",
		columnCount_plural: "{{count}} 列",
		columns: "列",
		editColumns: "编辑列",
		noColumns: "暂无列。打开列编辑器以添加。",
		overview: "概览",
		tips: "提示",
		tip1: "在列之间拖拽卡片以更改状态",
		tip2: "点击列名以编辑",
		tip3: "在对话中打开会将任务作为首条提示发送",
		emptyInspector: "点击任务以编辑，或点击\u201C列\u201D按钮配置状态。",
	},

	// ── 例程 ────────────────────────────────────────────────────────────
	routines: {
		title: "例程",
		total: "总计",
		enabled: "已启用",
		pipelines: "流水线",
		newRoutine: "新建例程",
		noRoutines: "暂无例程",
		noRoutinesHint: "创建流水线或安装每日简报模板。",
		steps: "步骤",
		percentOk: "% 成功",
		next: "下次",
		last: "上次",
		schedule: "调度",
		templates: "模板",
		noTemplates: "暂无模板。",
		triggers: "触发器",
		cronFormat: "Cron 格式",
		allRoutines: "所有例程",
		editor: "编辑器",
		editorNote: "构建器现在使用主画布编辑器。",
		overview: "概览",
		totalRoutines: "例程总数",
		runsRecorded: "运行记录",
		nextFire: "下次触发",
		noEnabledSchedules: "无已启用的定时例程。",
		loadingRoutine: "加载例程中...",
	},

	// ── 收件箱 ──────────────────────────────────────────────────────────
	inbox: {
		title: "全部收件",
		empty: "收件箱为空。",
		noItems: "无{{kind}}。",
		capture: "捕获",
		filter: "筛选",
		showProcessed: "显示已处理",
		markProcessed: "标记为已处理",
		markUnprocessed: "标记为未处理",
		promoteToTask: "提升为任务",
		openInChat: "在对话中打开",
		openInChatHint: "以此项开启新对话",
		untitled: "无标题",
		addNotes: "点击添加备注…",
		titlePlaceholder: "标题 — 简短摘要",
		bodyPlaceholder: "正文 — 详情、上下文、链接… (支持 markdown)",
		saveHint: "⌘+回车保存 · esc 取消",
		emptyDetail: "选择一项阅读，或捕获新内容。",
		openChatDraftLine1: "请帮我处理这条收件内容。如果它可执行，请提出一个具体的下一步；",
		openChatDraftLine2: "如果它是一个需要决策的问题，请帮我整理成清晰选项；如果应该转成任务，",
		openChatDraftLine3: "请调用 POST /api/tasks，并在回复里告诉我新任务 id。",
		kinds: {
			emails: "邮件",
			tickets: "工单",
			ideas: "想法",
			decisions: "决策",
			investigations: "调查",
			captures: "捕获",
		},
	},

	// ── 知识库 ──────────────────────────────────────────────────────────
	kb: {
		title: "知识库",
		file: "文件",
		graph: "图谱",
		backToTree: "返回树",
		fileViewer: "文件查看器",
		graphViewer: "力导向图",
		pickFile: "从树中选择文件。",
		pickFileDetail: "知识库读取 ~/kb 处的 wiki。",
		setExcludeDirsHint: "如果需要隐藏某些子目录，可设置 OMP_DECK_KB_EXCLUDE_DIRS。",
		clickNode: "点击节点",
		clickNodeDetail: "文件在此打开。图谱保持不变。",
		setupTitle: "设置知识库",
		createStarter: "创建初始 README",
		orSetEnv: "或设置 OMP_DECK_KB_ROOT 并重启 Deck。",
		inspector: "检查器",
		inspectorHint: "前置元数据、出站链接、反向链接、标签。",
		pickFileInspect: "选择文件以检查。",
		noFrontmatter: "无前置元数据",
		outbound: "出站链接",
		noOutbound: "无出站链接",
		backlinks: "反向链接",
		noBacklinks: "无反向链接",
		orphan: "孤立 — 无反向链接",
		edit: "编辑",
		search: "搜索知识库 (Ctrl-P)",
	},

	// ── 市场 ────────────────────────────────────────────────────────────
	marketplace: {
		title: "市场",
		searchPlaceholder: "按名称、标签、描述搜索",
		catalog: "目录",
		all: "全部",
		installed: "已安装",
		available: "可用",
		sources: "来源",
		allMarketplaces: "所有市场",
		noMarketplaces: "暂无市场",
		noMarketplacesHint: "添加市场目录以浏览和安装插件。",
		addMarketplace: "添加市场",
		noMatches: "无匹配的目录条目。",
		pluginDetails: "插件详情",
		pluginDetailsHint: "选择插件以查看完整元数据。",
		suggested: "推荐",
	},

	// ── 技能 ────────────────────────────────────────────────────────────
	skills: {
		title: "技能",
		searchPlaceholder: "搜索名称、描述、触发器、标签",
		noSkills: "未发现技能",
		backToList: "返回技能列表",
		inspector: "检查器",
		enabledYes: "是",
		enabledHidden: "隐藏 (frontmatter)",
		bundledFiles: "打包文件",
		reachableOnDemand: "按需可达 — 不会自动注入到 Agent 上下文中。",
		noSkillsHint: "将 SKILL.md 放入 ~/.omp/agent/skills/<name>/，或安装市场插件。",
		noMatches: "无匹配的技能。",
		noMatchesHint: "尝试清除来源/级别筛选或搜索框。",
		source: "来源",
		level: "级别",
		pickSkill: "选择技能以检查。",
		inspectorHint: "SKILL.md 前置元数据 + 相关文件。",
		fromPlugin: "来自插件",
	},

	// ── 集成 ────────────────────────────────────────────────────────────
	integrations: {
		title: "集成",
		comingTitle: "即将在 V1.5 推出",
		designDoc: "设计文档",
	},

	// ── 引导 ────────────────────────────────────────────────────────────
	onboarding: {
		header: "omp·deck 引导",
		skipSetup: "跳过设置",
		steps: {
			welcome: "欢迎",
			knowledgeBase: "知识库",
			connectProvider: "连接服务商",
			sessionGreeting: "会话问候",
			allSet: "准备就绪",
		},
		welcomeTitle: "欢迎使用 omp·deck",
		allSetTitle: "设置完成",
		openChat: "打开对话",
		skipStep: "跳过此步骤",
		skipLater: "跳过 — 稍后连接",
		skipGreeting: "跳过 — 空白输入即可",
		errorPrefix: "设置错误：",
	},

	// ── 通知 ────────────────────────────────────────────────────────────
	notifications: {
		permission: {
			enable: "启用通知",
			notNow: "稍后",
			blocked: "操作系统通知已被阻止。应用内提示仍会显示。要重新启用，请打开浏览器设置 → 网站权限 → 通知，并允许此来源。",
			prompt: "启用浏览器通知，以便 Deck 在例程失败或需要关注时提醒您。",
		},
		toast: {
			view: "查看",
			dismissNotification: "关闭通知",
		},
	},
} as const;

export default zhCN;

/**
 * English translation resource — source-of-truth fallback locale.
 *
 * Key structure uses semantic namespaces:
 *   common.*  — shared actions, status labels
 *   nav.*     — navigation rail labels
 *   layout.*  — layout chrome (header, panels)
 *   sidebar.* — chat sidebar
 *   settings.* — settings view sections and controls
 *   tasks.*   — kanban / tasks view
 *   routines.* — routines view
 *   inbox.*   — inbox view
 *   kb.*      — knowledge base view
 *   marketplace.* — marketplace view
 *   skills.*  — skills view
 *   integrations.* — integrations view
 *   onboarding.* — onboarding wizard
 *   notifications.* — notification banner / toast copy
 */

const en = {
	// ── Common ──────────────────────────────────────────────────────────
	common: {
		actions: {
			save: "Save",
			cancel: "Cancel",
			close: "Close",
			dismiss: "Dismiss",
			replace: "Replace",
			unset: "Unset",
			reload: "Reload",
			reset: "Reset to default",
			enable: "Enable",
			disable: "Disable",
			start: "Start",
			stop: "Stop",
			restart: "Restart",
			login: "Login",
			signOut: "Sign out",
			create: "Create",
			add: "Add",
			edit: "Edit",
			delete: "Delete",
			run: "Run",
			runNow: "Run now",
			install: "Install",
			uninstall: "Uninstall",
			search: "Search",
			refresh: "Refresh",
			skip: "Skip",
			continue: "Continue",
			getStarted: "Get started",
			change: "Change…",
		},
		status: {
			loading: "Loading...",
			enabled: "Enabled",
			disabled: "Disabled",
			muted: "Muted",
			active: "active",
			pinned: "pinned",
			default: "default",
			override: "override",
			unsavedChanges: "Unsaved changes",
			notBuiltYet: "Not built yet",
			connected: "Connected",
			ready: "Ready",
			installed: "installed",
			manual: "manual",
		},
	},

	// ── Navigation ──────────────────────────────────────────────────────
	nav: {
		chat: "Chat",
		tasks: "Tasks",
		routines: "Routines",
		inbox: "Inbox",
		marketplace: "Marketplace",
		skills: "Skills",
		knowledge: "Knowledge",
		integrations: "Integrations",
		settings: "Settings",
	},

	// ── Layout ──────────────────────────────────────────────────────────
	layout: {
		toggleSessions: "Toggle sessions",
		toggleInspector: "Toggle inspector",
		closePanels: "Close panels",
		inspector: "Inspector",
		expandAllToolCards: "Expand all tool cards",
		collapseAllToolCards: "Collapse all tool cards",
	},

	// ── Sidebar (Chat) ─────────────────────────────────────────────────
	sidebar: {
		workspace: "Workspace",
		allWorkspaces: "(all workspaces)",
		newSession: "New session",
		sessions: "Sessions",
		noSessions: "No sessions yet.",
		refreshWorkspaces: "Refresh workspaces",
		refreshSessions: "Refresh sessions",
	},

	// ── Settings ────────────────────────────────────────────────────────
	settings: {
		title: "Settings",
		subtitle: "Configure this local deck instance",
		sections: {
			env: { label: "Env", description: "Process and deck-managed variables" },
			providers: { label: "Providers", description: "OAuth sign-in and API-key state" },
			messaging: { label: "Messaging", description: "Telegram and future chat bridges" },
			orientation: { label: "Orientation", description: "Prelude, /start, maintenance gate" },
			appearance: { label: "Appearance", description: "Themes, colors, fonts" },
			language: { label: "Language", description: "UI display language" },
			workspaces: { label: "Workspaces", description: "Pinned roots and display names" },
			notifications: { label: "Notifications", description: "Idle alerts and quiet hours" },
			about: { label: "About", description: "Version, paths, diagnostics" },
		},
		notes: {
			title: "Settings notes",
			body: "Secrets are masked in list responses. Replace values here; do not reveal unless using the loopback API directly.",
		},
		stub: {
			heading: "Not built yet",
			body: "This section is reserved so the settings layout is stable.",
		},
	},

	// ── Tasks / Kanban ──────────────────────────────────────────────────
	tasks: {
		title: "Kanban",
		taskCount: "{{count}} task",
		taskCount_plural: "{{count}} tasks",
		columnCount: "{{count}} column",
		columnCount_plural: "{{count}} columns",
		columns: "Columns",
		editColumns: "Edit columns",
		noColumns: "No columns. Open the column editor to add one.",
		overview: "Overview",
		tips: "Tips",
		tip1: "Drag cards between columns to change state",
		tip2: "Click a column name to edit it",
		tip3: "Open in chat sends the task as the first prompt",
		emptyInspector: "Click a task to edit, or the Columns button to configure states.",
	},

	// ── Routines ────────────────────────────────────────────────────────
	routines: {
		title: "Routines",
		total: "total",
		enabled: "enabled",
		pipelines: "pipelines",
		newRoutine: "New routine",
		noRoutines: "No routines yet",
		noRoutinesHint: "Create a pipeline or install the daily briefing template.",
		steps: "steps",
		percentOk: "% ok",
		next: "next",
		last: "last",
		schedule: "Schedule",
		templates: "Templates",
		noTemplates: "No templates.",
		triggers: "triggers",
		cronFormat: "Cron format",
		allRoutines: "All routines",
		editor: "Editor",
		editorNote: "The builder now uses the main canvas editor.",
		overview: "Overview",
		totalRoutines: "Total routines",
		runsRecorded: "Runs recorded",
		nextFire: "Next fire",
		noEnabledSchedules: "No enabled scheduled routines.",
		loadingRoutine: "Loading routine...",
	},

	// ── Inbox ───────────────────────────────────────────────────────────
	inbox: {
		title: "All inbox",
		empty: "Inbox is empty.",
		noItems: "No {{kind}}.",
		capture: "Capture",
		filter: "Filter",
		showProcessed: "Show processed",
		markProcessed: "Mark processed",
		markUnprocessed: "Mark unprocessed",
		promoteToTask: "Promote to task",
		openInChat: "Open in chat",
		openInChatHint: "Open this item as a new chat session",
		untitled: "Untitled",
		addNotes: "Click to add notes…",
		titlePlaceholder: "Title — short summary of the thought",
		bodyPlaceholder: "Body — details, context, links… (markdown supported)",
		saveHint: "⌘+enter to save · esc to cancel",
		emptyDetail: "Pick an item to read, or capture a new one.",
		openChatDraftLine1: "Help me act on this. If it's actionable, propose a concrete next step;",
		openChatDraftLine2: "if it's a decision needing input, frame the choice; if it should become a",
		openChatDraftLine3: "task, POST /api/tasks and report the new task id.",
		kinds: {
			emails: "emails",
			tickets: "tickets",
			ideas: "ideas",
			decisions: "decisions",
			investigations: "investigations",
			captures: "captures",
		},
	},

	// ── Knowledge Base ──────────────────────────────────────────────────
	kb: {
		title: "Knowledge",
		file: "File",
		graph: "Graph",
		backToTree: "Back to tree",
		fileViewer: "File viewer",
		graphViewer: "Force-directed graph",
		pickFile: "Pick a file from the tree.",
		pickFileDetail: "The KB cockpit reads your wiki at ~/kb.",
		setExcludeDirsHint: "Set OMP_DECK_KB_EXCLUDE_DIRS to hide subtrees if you need to.",
		clickNode: "Click a node",
		clickNodeDetail: "The file opens here. The graph stays put.",
		setupTitle: "Set up your knowledge base",
		createStarter: "Create starter README",
		orSetEnv: "Or set OMP_DECK_KB_ROOT and restart the deck.",
		inspector: "Inspector",
		inspectorHint: "Frontmatter, outbound, backlinks, tags.",
		pickFileInspect: "Pick a file to inspect.",
		noFrontmatter: "no frontmatter",
		outbound: "outbound",
		noOutbound: "no outbound links",
		backlinks: "backlinks",
		noBacklinks: "no backlinks",
		orphan: "orphan — no backlinks",
		edit: "Edit",
		search: "Search KB (Ctrl-P)",
	},

	// ── Marketplace ─────────────────────────────────────────────────────
	marketplace: {
		title: "Marketplace",
		searchPlaceholder: "Search by name, tag, description",
		catalog: "Catalog",
		all: "All",
		installed: "Installed",
		available: "Available",
		sources: "Sources",
		allMarketplaces: "All marketplaces",
		noMarketplaces: "No marketplaces yet",
		noMarketplacesHint: "Add a marketplace catalog to browse and install plugins.",
		addMarketplace: "Add marketplace",
		noMatches: "No catalog entries match the current filters.",
		pluginDetails: "Plugin details",
		pluginDetailsHint: "Select a plugin to see its full metadata.",
		suggested: "Suggested",
	},

	// ── Skills ──────────────────────────────────────────────────────────
	skills: {
		title: "Skills",
		searchPlaceholder: "Search name, description, triggers, tags",
		noSkills: "No skills discovered",
		noSkillsHint: "Drop a SKILL.md into ~/.omp/agent/skills/<name>/, or install a marketplace plugin.",
		noMatches: "No skills match the current filters.",
		noMatchesHint: "Try clearing the source / level filters or the search box.",
		source: "Source",
		level: "Level",
		backToList: "Back to list",
		inspector: "Inspector",
		enabledYes: "yes",
		enabledHidden: "hidden (frontmatter)",
		bundledFiles: "Bundled files",
		reachableOnDemand: "Reachable on demand — not auto-injected into the agent's context.",
		pickSkill: "Pick a skill to inspect.",
		inspectorHint: "SKILL.md frontmatter + co-located files.",
		fromPlugin: "from plugin",
	},

	// ── Integrations ────────────────────────────────────────────────────
	integrations: {
		title: "Integrations",
		comingTitle: "Coming in V1.5",
		designDoc: "Design doc",
	},

	// ── Onboarding ──────────────────────────────────────────────────────
	onboarding: {
		header: "omp·deck onboarding",
		skipSetup: "Skip setup",
		steps: {
			welcome: "Welcome",
			knowledgeBase: "Knowledge base",
			connectProvider: "Connect provider",
			sessionGreeting: "Session greeting",
			allSet: "All set",
		},
		welcomeTitle: "Welcome to omp·deck",
		allSetTitle: "You're set up",
		openChat: "Open chat",
		skipStep: "Skip this step",
		skipLater: "Skip — I'll connect later",
		skipGreeting: "Skip — empty composer is fine",
		errorPrefix: "Setup error:",
	},

	// ── Notifications ───────────────────────────────────────────────────
	notifications: {
		permission: {
			enable: "Enable notifications",
			notNow: "Not now",
			blocked: "OS notifications are blocked. In-app toasts will still appear. To re-enable, open browser settings → Site permissions → Notifications and allow this origin.",
			prompt: "Enable browser notifications so the deck can ping you when a routine fails or needs attention.",
		},
		toast: {
			view: "View",
			dismissNotification: "Dismiss notification",
		},
	},
} as const;

export default en;

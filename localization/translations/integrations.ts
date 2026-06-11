export const INTEGRATIONS_VIEW_HOOK = `export function IntegrationsView() {
	const { t } = useTranslation();
	return (`;

export const INTEGRATIONS_TITLE = `<div className="meta">{t("integrations.title")}</div>`;

export const INTEGRATIONS_COMING_TITLE = `<h2 className="text-lg font-medium text-ink">{t("integrations.comingTitle")}</h2>`;

export const INTEGRATIONS_DESIGN_DOC = `<div className="meta mb-1.5">{t("integrations.designDoc")}</div>`;

export const INTEGRATIONS_SIDEBAR_TITLE = `<div className="meta mb-2">{t("integrations.title")}</div>`;
export const INTEGRATIONS_SIDEBAR_HINT = `<div className="text-sm text-ink-3">
						V1.5 会提供已安装 MCP Server 展示与一键式 Workspace 配置。
					</div>`;
export const INTEGRATIONS_INTRO = `<p className="text-sm text-ink-2">
								集成页面将在未来承载精选 MCP Server 目录的一键安装，例如
								<a
									href="https://github.com/taylorwilsdon/google_workspace_mcp"
									target="_blank"
									rel="noreferrer"
									className="text-accent hover:underline"
								>
									Google Workspace
								</a>
								（Gmail、Calendar、Drive、Docs 等）、Slack、GitHub、Linear、Notion、Discord。
								同时也会补上租户级 OAuth、自动刷新以及 advertised-tools 面板。
							</p>`;
export const INTEGRATIONS_V1 = `<p className="text-sm text-ink-2">
								<strong className="text-ink">当前 V1：</strong> 你已经可以在聊天里通过
								<code className="paper-code px-1 py-0.5 text-xs">/mcp install &lt;url-or-smithery-id&gt;</code>
								或
								<code className="paper-code px-1 py-0.5 text-xs">/mcp smithery-search &lt;query&gt;</code>
								安装 MCP Server。安装完成后，任何例程中的 <code>agent</code> 步骤都可以通过
								<code className="paper-code px-1 py-0.5 text-xs">mcp_servers_allowed: [...]</code> 调用它们。
							</p>`;
export const INTEGRATIONS_MCP_STEP = `<p className="text-sm text-ink-2">
								专用的 <code>mcp</code> 步骤类型也会在 V1.5 一并落地；等 SDK Bridge 暴露直接的
								<code className="paper-code px-1 py-0.5 text-xs">callMcpTool()</code> 接口后，就能支持确定性工具调用。
								目前 schema 已经接受该步骤定义，只是执行层暂时延后。
							</p>`;

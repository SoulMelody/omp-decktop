import { ModelRolesSection } from "@/components/settings/ModelRolesSection";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Layout } from "@/components/Layout";
import { EnvSection } from "@/components/settings/EnvSection";
import { MessagingSection } from "@/components/settings/MessagingSection";
import { OrientationSection } from "@/components/settings/OrientationSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { ProvidersSection } from "@/components/settings/ProvidersSection";
import { LspSection } from "@/components/settings/LspSection";
import { SECTIONS, normalizeSection, type SectionId } from "@/components/settings/settings-helpers";
import { cn } from "@/lib/utils";

export function SettingsView() {
	const [params, setParams] = useSearchParams();
	const { t } = useTranslation();
	const selected = normalizeSection(params.get("section"));

	function setSection(section: SectionId): void {
		const next = new URLSearchParams(params);
		next.set("section", section);
		setParams(next, { replace: true });
	}

	return (
		<Layout
			sidebar={<SettingsSideRail />}
			inspector={<SettingsInspector />}
			main={
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
						<div className="meta">{t("settings.title")}</div>
						<div className="text-xs text-ink-3">{t("settings.subtitle")}</div>
					</div>
					<div className="grid min-h-0 flex-1 grid-cols-[220px_1fr] overflow-hidden">
						<nav className="border-r border-line bg-paper-2/40 p-2">
							{SECTIONS.map((section) => (
								<button
									key={section.id}
									type="button"
									onClick={() => setSection(section.id)}
									className={cn(
										"mb-1 block w-full rounded-md px-2 py-2 text-left transition-colors",
										selected === section.id ? "bg-accent-soft text-accent" : "hover:bg-paper-3",
									)}
								>
									<div className="font-mono text-xs font-medium uppercase tracking-meta">
										{section.label}
									</div>
									<div className="mt-0.5 text-xs text-ink-3">{section.description}</div>
								</button>
							))}
						</nav>
						<section className="min-h-0 overflow-auto p-4">
							{selected === "env" ? (
								<EnvSection />
							) : selected === "providers" ? (
								<ProvidersSection />
							) : selected === "messaging" ? (
								<MessagingSection />
							) : selected === "orientation" ? (
								<OrientationSection />
							) : selected === "notifications" ? (
								<NotificationsSection />
							) : selected === "modelRoles" ? (
								<ModelRolesSection />
							) : selected === "lsp" ? (
								<LspSection />
							) : (
								<StubSection section={selected} />
							)}
						</section>
					</div>
				</div>
			}
		/>
	);
}

function StubSection({
	section,
}: {
	section: Exclude<SectionId, "env" | "providers" | "messaging" | "orientation" | "notifications" | "modelRoles" | "lsp">;
}) {
	const spec = SECTIONS.find((s) => s.id === section)!;
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-3xl rounded-md border border-dashed border-line bg-paper-2 p-6">
			<div className="meta">{spec.label}</div>
			<h1 className="mt-2 text-xl font-semibold">{t("settings.stub.heading")}</h1>
			<p className="mt-1 text-sm text-ink-3">{t("settings.stub.body")}</p>
		</div>
	);
}

function SettingsSideRail() {
	const { t } = useTranslation();
	return <div className="p-3 text-xs text-ink-3">{t("settings.title")}</div>;
}

function SettingsInspector() {
	return (
		<div className="space-y-2 p-3 text-xs text-ink-3">
			<div className="meta">Settings notes</div>
			<p>Secrets are masked in list responses. Replace values here; do not reveal unless using the loopback API directly.</p>
		</div>
	);
}

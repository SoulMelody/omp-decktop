import { injectNamedImport, replaceOne } from "../../utils/string.js";
import {
	ZH_SETTINGS_SECTIONS,
	SETTINGS_TOP_TITLE,
	SETTINGS_TOP_SUBTITLE,
	SETTINGS_LANG_BRANCH,
	SETTINGS_PROVIDERS_LOADING,
	SETTINGS_PROVIDERS_META,
	LANGUAGE_SECTION_CODE,
	SETTINGS_STUB_SECTION_SIG,
} from "../../translations.js";

/**
 * Inject `const { t } = useTranslation();` right after the opening brace of
 * the given component function.  Works for both parameterless (`function X() {`)
 * and destructured-parameter signatures (`function X({ ... }) {`).
 */
function injectTranslationHook(source: string, fnName: string): string {
	const hook = `\n	const { t } = useTranslation();`;
	const simple = new RegExp(`function ${fnName}\\(\\) \\{`);
	if (simple.test(source)) {
		return source.replace(simple, `function ${fnName}() {${hook}`);
	}
	const multi = new RegExp(`(function ${fnName}\\([\\s\\S]*?\\) \\{)`);
	if (multi.test(source)) {
		return source.replace(multi, `$1${hook}`);
	}
	throw new Error(`injectTranslationHook: ${fnName} not found`);
}

/** Replace SECTIONS array in settings-helpers.tsx for Chinese builds. */
export function localizeSettingsHelpers(source: string): string {
	let next = injectNamedImport(source, "@/i18n/useLocale", "useLocale");
	next = injectNamedImport(next, "react-i18next", "useTranslation");

	next = replaceOne(
		next,
		/export const SECTIONS = \[[\s\S]*?\] as const;/,
		ZH_SETTINGS_SECTIONS,
		"settings-helpers: localized SECTIONS",
	);

	return next;
}

export function localizeSettingsView(source: string): string {
	let next = injectNamedImport(source, "@/i18n/useLocale", "useLocale");
	next = injectNamedImport(next, "react-i18next", "useTranslation");

	next = replaceOne(next, '<div className="meta">Settings</div>', SETTINGS_TOP_TITLE, "SettingsView: top title");
	next = replaceOne(next, '<div className="text-xs text-ink-3">Configure this local deck instance</div>', SETTINGS_TOP_SUBTITLE, "SettingsView: top subtitle");

	// Replace the branch after NotificationsSection to inject LanguageSection.
	next = replaceOne(
		next,
		`) : selected === "notifications" ? (
								<NotificationsSection />
							) : selected === "modelRoles" ? (
								<ModelRolesSection />
							) : (
								<StubSection section={selected} />
							)}`,
		SETTINGS_LANG_BRANCH,
		"SettingsView: language + modelRoles branch",
	);
	// ProvidersSection is handled by localizeProvidersSection.


	// Insert LanguageSection component before StubSection, update StubSection sig.
	next = replaceOne(
		next,
		'function StubSection({ section }: { section: Exclude<SectionId, "env" | "messaging" | "appearance" | "notifications" | "modelRoles"> }) {',
		`${LANGUAGE_SECTION_CODE}\n\n${SETTINGS_STUB_SECTION_SIG}`,
		"SettingsView: insert language section",
	);


	return next;
}

export function localizeProvidersSection(source: string): string {
	let next = source;
	next = replaceOne(
		next,
		/if \(loading\) \{\s*return <div className="font-mono text-2xs text-ink-3">Loading providers\u2026[\s\S]*?<\/div>;\s*\}/,
		SETTINGS_PROVIDERS_LOADING,
		"ProvidersSection: loading",
	);
	next = replaceOne(next, '<h2 className="meta">Providers</h2>', SETTINGS_PROVIDERS_META, "ProvidersSection: meta");
	return next;
}

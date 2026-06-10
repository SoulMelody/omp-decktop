/**
 * i18n initialization for omp-deck web frontend.
 *
 * Uses i18next + react-i18next. Locale is resolved from:
 *   1. localStorage (user's explicit choice)
 *   2. Browser language (navigator.language)
 *   3. Fallback to "en"
 *
 * Missing translations always fall back to English.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./resources/en";
import zhCN from "./resources/zh-CN";

const LOCALE_STORAGE_KEY = "omp-deck:locale";

function detectLocale(): string {
	try {
		const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
		if (stored && (stored === "en" || stored === "zh-CN")) return stored;
	} catch {
		/* quota / private browsing */
	}
	const browserLang = navigator.language;
	if (browserLang.startsWith("zh")) return "zh-CN";
	return "en";
}

void i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en },
		"zh-CN": { translation: zhCN },
	},
	lng: detectLocale(),
	fallbackLng: "en",
	interpolation: {
		escapeValue: false, // React already escapes
	},
});

export default i18n;

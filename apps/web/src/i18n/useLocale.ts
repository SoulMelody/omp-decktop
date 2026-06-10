/**
 * Locale helper hook — provides a way to programmatically switch languages
 * and persist the choice in localStorage.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

const LOCALE_STORAGE_KEY = "omp-deck:locale";

export type SupportedLocale = "en" | "zh-CN";

export const SUPPORTED_LOCALES: ReadonlyArray<{
	code: SupportedLocale;
	label: string;
	nativeLabel: string;
}> = [
	{ code: "en", label: "English", nativeLabel: "English" },
	{ code: "zh-CN", label: "Chinese (Simplified)", nativeLabel: "简体中文" },
];

export function useLocale(): {
	locale: SupportedLocale;
	setLocale: (locale: SupportedLocale) => void;
} {
	const { i18n } = useTranslation();
	const locale = (i18n.resolvedLanguage as SupportedLocale) ?? "en";

	const setLocale = useCallback(
		(next: SupportedLocale) => {
			try {
				localStorage.setItem(LOCALE_STORAGE_KEY, next);
			} catch {
				/* quota / private browsing */
			}
			void i18n.changeLanguage(next);
		},
		[i18n],
	);

	return { locale, setLocale };
}

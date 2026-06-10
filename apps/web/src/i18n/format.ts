/**
 * Shared formatting helpers using Intl APIs.
 * Locale-aware date/time/number formatting.
 */

import type { SupportedLocale } from "./useLocale";

const LOCALE_MAP: Record<SupportedLocale, string> = {
	en: "en-US",
	"zh-CN": "zh-CN",
};

function intlLocale(locale: SupportedLocale): string {
	return LOCALE_MAP[locale] ?? "en-US";
}

export function formatDate(
	date: Date | number | string,
	locale: SupportedLocale,
	options?: Intl.DateTimeFormatOptions,
): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString(intlLocale(locale), options);
}

export function formatDateTime(
	date: Date | number | string,
	locale: SupportedLocale,
	options?: Intl.DateTimeFormatOptions,
): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleString(intlLocale(locale), options);
}

export function formatTime(
	date: Date | number | string,
	locale: SupportedLocale,
	options?: Intl.DateTimeFormatOptions,
): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleTimeString(intlLocale(locale), options);
}

export function formatNumber(
	value: number,
	locale: SupportedLocale,
	options?: Intl.NumberFormatOptions,
): string {
	return value.toLocaleString(intlLocale(locale), options);
}

import { injectNamedImport } from "../../utils/string.js";

export function localizeIntegrationsView(source: string): string {
	// Only inject the translation hook for now.
	// Individual text replacements are skipped — the UI was rewritten in the
	// SDK-16 cycle and the old patterns no longer match. Add them back when
	// the new UI stabilizes.
	return injectNamedImport(source, "react-i18next", "useTranslation");
}

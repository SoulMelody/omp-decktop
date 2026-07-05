import type { SessionUi, UserMsg, AssistantMsg } from "@/lib/types";
import { truncate } from "@/lib/utils";

/** Extract the first user message text from a live session. */
export function firstUserMessage(s: SessionUi): string {
	for (const m of s.messages) {
		if (m.role === "user") {
			const um = m as UserMsg;
			const text = um.text.replace(/\n/g, " ").trim();
			if (text) return truncate(text, 52);
		}
	}
	return "";
}

/** Extract the last user message text from a live session. */
export function lastUserMessage(s: SessionUi): string {
	for (let i = s.messages.length - 1; i >= 0; i--) {
		const m = s.messages[i];
		if (!m || m.role !== "user") continue;
		const text = (m as UserMsg).text.replace(/\n/g, " ").trim();
		if (text) return truncate(text, 52);
	}
	return "";
}

/**
 * Extract the last meaningful assistant message from a live session.
 * Walks backward so the most recent exchange wins.
 */
export function lastConversationMessage(s: SessionUi): string {
	for (let i = s.messages.length - 1; i >= 0; i--) {
		const m = s.messages[i];
		if (!m || m.role !== "assistant") continue;
		const am = m as AssistantMsg;
		const textBlock = am.blocks.find((b) => b.type === "text");
		if (textBlock?.type === "text") {
			const text = textBlock.text.replace(/\n/g, " ").trim();
			if (text) return truncate(text, 52);
		}
	}
	return "";
}

/** Format a session ID for display: full if ≤8 chars, else "abcd…wxyz". */
export function formatSessionId(id: string): string {
	if (id.length <= 8) return id;
	return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

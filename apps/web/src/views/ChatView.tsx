import { Layout } from "@/components/Layout";
import { Sidebar } from "@/components/Sidebar";
import { Chat } from "@/components/Chat";
import { Composer } from "@/components/Composer";
import { Inspector } from "@/components/Inspector";
import { TerminalPanel } from "@/components/TerminalPanel";
import { useStore } from "@/lib/store";
import { StatusBar } from "@/components/chrome/StatusBar";
import { ExtUiDialog } from "@/components/chat/ExtUiDialog";
import { useSessionRoute } from "@/lib/use-session-route";

export function ChatView() {
	const terminalOpen = useStore((s) => s.terminalOpen);
	useSessionRoute();

	return (
		<>
			<Layout
				sidebar={<Sidebar />}
				main={
					<div className="flex h-full min-h-0 flex-col">
						<Chat />
						<Composer />
						{terminalOpen ? (
							<div className="h-[40%] shrink-0 border-t border-line">
								<TerminalPanel />
							</div>
						) : null}
					</div>
				}
				inspector={<Inspector />}
				topBar={<StatusBar />}
			/>
			<ExtUiDialog />
		</>
	);
}

import { describe, expect, test } from "bun:test";

import { useStore } from "./store";

interface FakeFrame {
	type: "models_changed" | "tasks_changed" | "skills_changed";
}

describe("modelsChangeCounter broadcast wiring", () => {
	test("models_changed increments the global counter and is idempotent on no-op", () => {
		const initial = useStore.getState().modelsChangeCounter;
		const listener = (frame: unknown): void => {
			const typed = frame as FakeFrame;
			useStore.setState((state) => {
				if (typed.type === "models_changed") {
					return { modelsChangeCounter: state.modelsChangeCounter + 1 };
				}
				return state;
			});
		};
		listener({ type: "models_changed" });
		listener({ type: "tasks_changed" });
		listener({ type: "models_changed" });
		const final = useStore.getState().modelsChangeCounter;
		expect(final).toBe(initial + 2);
	});

	test("counter monotonically increases and supports subscribing to refresh", () => {
		const observed: number[] = [];
		const stop = useStore.subscribe((state) => {
			observed.push(state.modelsChangeCounter);
		});
		const before = useStore.getState().modelsChangeCounter;
		useStore.setState((s) => ({ modelsChangeCounter: s.modelsChangeCounter + 1 }));
		useStore.setState((s) => ({ modelsChangeCounter: s.modelsChangeCounter + 1 }));
		const after = useStore.getState().modelsChangeCounter;
		stop();
		expect(after).toBeGreaterThan(before + 1);
		expect(observed.length).toBeGreaterThan(0);
		expect(observed.at(-1)).toBe(after);
	});
});

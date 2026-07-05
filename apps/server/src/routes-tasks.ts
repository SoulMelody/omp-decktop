/**
 * Tasks + task-states REST surface.
 *
 * Mounted on the main router at `/api/tasks` and `/api/task-states`. All
 * payloads use the protocol types verbatim. Validation is intentionally light
 * — the schema enforces shape (FK, CHECK constraints), we surface DB errors
 * back as 400/500.
 */

import { Hono } from "hono";
import type {
	CreateTaskRequest,
	CreateTaskStateRequest,
	ListTasksResponse,
	MoveTaskRequest,
	TaskPriority,
	UpdateTaskRequest,
	UpdateTaskStateRequest,
} from "@omp-deck/protocol";

import { logger } from "./log.ts";
import { broadcastBus } from "./broadcast-bus.ts";
import {
	createState,
	createTask,
	deleteState,
	deleteTask,
	getState,
	getTask,
	listStates,
	listTasks,
	moveTask,
	reorderStates,
	updateState,
	updateTask,
} from "./db/tasks.ts";

const log = logger("routes:tasks");
const TASK_PRIORITIES: readonly TaskPriority[] = ["P0", "P1", "P2", "P3", "P4", "P5"];

function parsePriorities(raw: string | undefined): TaskPriority[] | undefined {
	if (!raw) return undefined;
	const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
	if (values.length === 0) return undefined;
	for (const value of values) {
		if (!TASK_PRIORITIES.includes(value as TaskPriority)) {
			throw new Error(`invalid priority: ${value}`);
		}
	}
	return values as TaskPriority[];
}


function notifyTasksChanged(): void {
	broadcastBus.broadcast({ type: "tasks_changed" });
}

export function buildTasksRouter(): Hono {
	const app = new Hono();

	// ─── Tasks ─────────────────────────────────────────────────────────────

	app.get("/tasks", (c) => {
		const includeArchived = c.req.query("includeArchived") === "1";
		let priorities: TaskPriority[] | undefined;
		try {
			priorities = parsePriorities(c.req.query("priority"));
		} catch (err) {
			return c.json({ error: String((err as Error).message ?? err) }, 400);
		}
		const sort = c.req.query("sort") === "priority" ? "priority" : undefined;
		const tasks = listTasks({ includeArchived, priorities, sort });
		const states = listStates();
		const body: ListTasksResponse = { tasks, states };
		return c.json(body);
	});

	app.post("/tasks", async (c) => {
		let body: CreateTaskRequest;
		try {
			body = (await c.req.json()) as CreateTaskRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!body.title || typeof body.title !== "string") {
			return c.json({ error: "title is required" }, 400);
		}
		try {
			const task = createTask(body);
			notifyTasksChanged();
			return c.json(task, 201);
		} catch (err) {
			log.error(`createTask failed`, err);
			return c.json({ error: String(err) }, 400);
		}
	});

	app.get("/tasks/:id", (c) => {
		const task = getTask(c.req.param("id"));
		if (!task) return c.json({ error: "not found" }, 404);
		return c.json(task);
	});

	app.patch("/tasks/:id", async (c) => {
		let body: UpdateTaskRequest;
		try {
			body = (await c.req.json()) as UpdateTaskRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		try {
			const updated = updateTask(c.req.param("id"), body);
			if (!updated) return c.json({ error: "not found" }, 404);
			notifyTasksChanged();
			return c.json(updated);
		} catch (err) {
			log.error(`updateTask failed`, err);
			return c.json({ error: String(err) }, 400);
		}
	});

	app.delete("/tasks/:id", (c) => {
		const ok = deleteTask(c.req.param("id"));
		if (ok) notifyTasksChanged();
		return c.json({ ok });
	});

	app.post("/tasks/:id/move", async (c) => {
		let body: MoveTaskRequest;
		try {
			body = (await c.req.json()) as MoveTaskRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!body.stateId || typeof body.index !== "number") {
			return c.json({ error: "stateId and numeric index required" }, 400);
		}
		try {
			const moved = moveTask(c.req.param("id"), body.stateId, body.index);
			if (!moved) return c.json({ error: "task not found" }, 404);
			notifyTasksChanged();
			return c.json(moved);
		} catch (err) {
			log.error(`moveTask failed`, err);
			return c.json({ error: String(err) }, 400);
		}
	});

	// ─── States ────────────────────────────────────────────────────────────

	app.get("/task-states", (c) => c.json({ states: listStates() }));

	app.post("/task-states", async (c) => {
		let body: CreateTaskStateRequest;
		try {
			body = (await c.req.json()) as CreateTaskStateRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!body.name) return c.json({ error: "name required" }, 400);
		try {
			const state = createState(body);
			return c.json(state, 201);
		} catch (err) {
			log.error(`createState failed`, err);
			return c.json({ error: String(err) }, 400);
		}
	});

	app.post("/task-states/reorder", async (c) => {
		let body: { orderedIds?: unknown };
		try {
			body = (await c.req.json()) as { orderedIds?: unknown };
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!Array.isArray(body.orderedIds) || body.orderedIds.some((x) => typeof x !== "string")) {
			return c.json({ error: "orderedIds must be string[]" }, 400);
		}
		try {
			const states = reorderStates(body.orderedIds as string[]);
			notifyTasksChanged();
			return c.json({ states });
		} catch (err) {
			log.error(`reorderStates failed`, err);
			return c.json({ error: String(err) }, 400);
		}
	});

	app.patch("/task-states/:id", async (c) => {
		let body: UpdateTaskStateRequest;
		try {
			body = (await c.req.json()) as UpdateTaskStateRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const updated = updateState(c.req.param("id"), body);
		if (!updated) return c.json({ error: "not found" }, 404);
		return c.json(updated);
	});

	app.delete("/task-states/:id", (c) => {
		try {
			const result = deleteState(c.req.param("id"));
			return c.json(result);
		} catch (err) {
			return c.json({ error: String(err) }, 400);
		}
	});

	app.get("/task-states/:id", (c) => {
		const state = getState(c.req.param("id"));
		if (!state) return c.json({ error: "not found" }, 404);
		return c.json(state);
	});

	return app;
}

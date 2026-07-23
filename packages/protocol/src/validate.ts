/**
 * Ajv validator for V1 routine specs. Single source of truth: the JSON
 * Schemas under `./schemas/`. The visual builder (Phase 3) reads the same
 * files to drive per-step form rendering.
 *
 * Schemas are registered with Ajv by their `$id` (e.g.
 * `omp-deck/schemas/step-common.json`), and the root `routine-spec.json`
 * `$ref`-resolves against that namespace.
 */

import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import routineSpecSchema from "./schemas/routine-spec.json";
import routineLayoutSchema from "./schemas/routine-layout.json";
import stepAgentSchema from "./schemas/step-agent.json";
import stepCommonSchema from "./schemas/step-common.json";
import stepDeckSchema from "./schemas/step-deck.json";
import stepHttpSchema from "./schemas/step-http.json";
import stepMcpSchema from "./schemas/step-mcp.json";
import stepRunSchema from "./schemas/step-run.json";
import stepSetStateSchema from "./schemas/step-set_state.json";
import stepTransformSchema from "./schemas/step-transform.json";
import stepWaitSchema from "./schemas/step-wait.json";
import stepWriteSchema from "./schemas/step-write.json";
import triggerCronSchema from "./schemas/trigger-cron.json";
import triggerEventSchema from "./schemas/trigger-event.json";
import triggerManualSchema from "./schemas/trigger-manual.json";
import triggerWebhookSchema from "./schemas/trigger-webhook.json";
import fsOpsSchema from "./schemas/fs-ops.json";
import gitOpsSchema from "./schemas/git-ops.json";

export interface ValidationError {
	/** JSON Pointer to the offending node (Ajv's `instancePath`). */
	path: string;
	/** Ajv's keyword that triggered (e.g. "required", "enum", "type"). */
	keyword: string;
	/** Human-readable message. */
	message: string;
	/** Schema-side context (e.g. {missingProperty: "id"} for required-keyword errors). */
	params: Record<string, unknown>;
}

export interface ValidationResult {
	valid: boolean;
	errors?: ValidationError[];
}

const SUB_SCHEMAS = [
	stepCommonSchema,
	stepRunSchema,
	stepAgentSchema,
	stepWriteSchema,
	stepHttpSchema,
	stepDeckSchema,
	stepMcpSchema,
	stepTransformSchema,
	stepWaitSchema,
	stepSetStateSchema,
	triggerCronSchema,
	triggerWebhookSchema,
	triggerManualSchema,
	triggerEventSchema,
	routineLayoutSchema,
	fsOpsSchema,
	gitOpsSchema,
] as const;

/**
 * Compiled per-endpoint validators. Each key is the `endpoint name` used
 * by the server routes; each value is the compiled Ajv validator for that
 * request shape. Compiled lazily on first use to keep the cold-start cost
 * low — only the routine-spec validator is compiled eagerly because the
 * builder UI relies on it for visual rendering.
 */
type EndpointName =
	| "fs.mkdir"
	| "fs.write"
	| "fs.rename"
	| "fs.delete"
	| "fs.reveal"
	| "fs.search"
	| "fs.clone"
	| "fs.exec"
	| "fs.grant"
	| "fs.editor.open"
	| "git.stage"
	| "git.revert"
	| "git.commit"
	| "git.push"
	| "git.pull"
	| "git.fetch"
	| "git.branch.create"
	| "git.branch.delete"
	| "git.branch.rename"
	| "git.checkout"
	| "git.log"
	| "git.stash.push"
	| "git.stash.apply"
	| "git.merge"
	| "git.rebase"
	| "git.cherryPick"
	| "git.revertCommit"
	| "git.reset"
	| "git.worktree.create"
	| "git.worktree.delete"
	| "git.setIdentity"
	| "git.remote.add"
	| "git.remote.remove"
	| "git.remote.deleteBranch";

const ENDPOINT_SCHEMAS: Record<EndpointName, { schema: unknown; def: string }> = {
	"fs.mkdir":              { schema: fsOpsSchema,    def: "FsMkdirRequest" },
	"fs.write":              { schema: fsOpsSchema,    def: "FsWriteRequest" },
	"fs.rename":             { schema: fsOpsSchema,    def: "FsRenameRequest" },
	"fs.delete":             { schema: fsOpsSchema,    def: "FsDeleteRequest" },
	"fs.reveal":             { schema: fsOpsSchema,    def: "FsRevealRequest" },
	"fs.search":             { schema: fsOpsSchema,    def: "FsSearchRequest" },
	"fs.clone":              { schema: fsOpsSchema,    def: "FsCloneRequest" },
	"fs.exec":               { schema: fsOpsSchema,    def: "FsExecRequest" },
	"fs.grant":              { schema: fsOpsSchema,    def: "FsIssueGrantRequest" },
	"fs.editor.open":        { schema: fsOpsSchema,    def: "FsEditorOpenRequest" },
	"git.stage":             { schema: gitOpsSchema,   def: "GitStageRequest" },
	"git.revert":            { schema: gitOpsSchema,   def: "GitRevertRequest" },
	"git.commit":            { schema: gitOpsSchema,   def: "GitCommitRequest" },
	"git.push":              { schema: gitOpsSchema,   def: "GitPushRequest" },
	"git.pull":              { schema: gitOpsSchema,   def: "GitPullRequest" },
	"git.fetch":             { schema: gitOpsSchema,   def: "GitFetchRequest" },
	"git.branch.create":     { schema: gitOpsSchema,   def: "GitBranchCreateRequest" },
	"git.branch.delete":     { schema: gitOpsSchema,   def: "GitBranchDeleteRequest" },
	"git.branch.rename":     { schema: gitOpsSchema,   def: "GitBranchRenameRequest" },
	"git.checkout":          { schema: gitOpsSchema,   def: "GitCheckoutRequest" },
	"git.log":               { schema: gitOpsSchema,   def: "GitLogRequest" },
	"git.stash.push":        { schema: gitOpsSchema,   def: "GitStashPushRequest" },
	"git.stash.apply":       { schema: gitOpsSchema,   def: "GitStashApplyRequest" },
	"git.merge":             { schema: gitOpsSchema,   def: "GitMergeRequest" },
	"git.rebase":            { schema: gitOpsSchema,   def: "GitRebaseRequest" },
	"git.cherryPick":        { schema: gitOpsSchema,   def: "GitCherryPickRequest" },
	"git.revertCommit":      { schema: gitOpsSchema,   def: "GitRevertCommitRequest" },
	"git.reset":             { schema: gitOpsSchema,   def: "GitResetRequest" },
	"git.worktree.create":   { schema: gitOpsSchema,   def: "GitWorktreeCreateRequest" },
	"git.worktree.delete":   { schema: gitOpsSchema,   def: "GitWorktreeDeleteRequest" },
	"git.setIdentity":       { schema: gitOpsSchema,   def: "GitSetIdentityRequest" },
	"git.remote.add":        { schema: gitOpsSchema,   def: "GitAddRemoteRequest" },
	"git.remote.remove":     { schema: gitOpsSchema,   def: "GitRemoveRemoteRequest" },
	"git.remote.deleteBranch": { schema: gitOpsSchema, def: "GitDeleteRemoteBranchRequest" },
};

let cachedEndpointValidators: Map<EndpointName, (input: unknown) => boolean> | null = null;

function compileEndpoint(name: EndpointName): (input: unknown) => boolean {
	const { ajv } = getValidator();
	const meta = ENDPOINT_SCHEMAS[name];
	const schemaObj = meta.schema as { $defs?: Record<string, unknown> };
	const def = schemaObj.$defs?.[meta.def];
	if (!def) {
		throw new Error(`Validator schema definition ${meta.def} not found`);
	}
	// Strip `allOf` and `$ref` references so the endpoint validator is a
	// single self-contained schema that Ajv can compile in isolation.
	const flattened = flattenAllOf(def);
	const standalone = {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		type: "object",
		...flattened,
	};
	return ajv.compile(standalone) as (input: unknown) => boolean;
}

/**
 * Inline every `$ref: "#/$defs/X"` and merge `allOf` siblings so the
 * resulting schema has no external references. This trades a tiny bit of
 * duplication for a robust validator that doesn't depend on Ajv's
 * cross-schema resolution at compile time. `properties` objects are
 * deep-merged so that combining `{ properties: { cwd, path } }` with
 * `{ properties: { recursive } }` produces `{ properties: { cwd, path, recursive } }`.
 */
function flattenAllOf(node: unknown): Record<string, unknown> {
	if (!node || typeof node !== "object") return {};
	const out: Record<string, unknown> = {};
	const obj = node as Record<string, unknown>;
	for (const [k, v] of Object.entries(obj)) {
		if (k === "allOf" && Array.isArray(v)) {
			for (const part of v) {
				deepMerge(out, flattenAllOf(part));
			}
			continue;
		}
		if (k === "$ref" && typeof v === "string") {
			const m = v.match(/^#\/\$defs\/(.+)$/);
			if (m) {
				const schemaObj = (ENDPOINT_SCHEMAS as Record<string, { schema: { $defs?: Record<string, unknown> } }>);
				for (const meta of Object.values(schemaObj)) {
					const ref = meta.schema.$defs?.[m[1]!];
					if (ref) {
						deepMerge(out, flattenAllOf(ref));
						break;
					}
				}
				continue;
			}
		}
		out[k] = v;
	}
	return out;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
	for (const [k, v] of Object.entries(source)) {
		const existing = target[k];
		if (
			existing && typeof existing === "object" && !Array.isArray(existing) &&
			v && typeof v === "object" && !Array.isArray(v)
		) {
			deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>);
		} else {
			target[k] = v;
		}
	}
}

function getEndpointValidators(): Map<EndpointName, (input: unknown) => boolean> {
	if (cachedEndpointValidators) return cachedEndpointValidators;
	const map = new Map<EndpointName, (input: unknown) => boolean>();
	for (const name of Object.keys(ENDPOINT_SCHEMAS) as EndpointName[]) {
		map.set(name, compileEndpoint(name));
	}
	cachedEndpointValidators = map;
	return map;
}

/**
 * Validate a request body for one of the file/git operation endpoints.
 * Returns Ajv errors as `ValidationError[]` so the server can map them to
 * 400 responses with a stable shape.
 */
export function validateEndpointRequest(name: EndpointName, input: unknown): ValidationResult {
	const validators = getEndpointValidators();
	const validate = validators.get(name);
	if (!validate) return { valid: false, errors: [{ path: "/", keyword: "unknownEndpoint", message: `unknown endpoint ${name}`, params: {} }] };
	const ok = validate(input);
	if (ok) return { valid: true };
	const errors = (validate as unknown as { errors?: ErrorObject[] | null }).errors;
	return { valid: false, errors: normalizeErrors(errors) };
}

let cachedValidator: ((spec: unknown) => boolean) | null = null;
let cachedAjv: Ajv2020 | null = null;

function getValidator(): { ajv: Ajv2020; validate: (spec: unknown) => boolean } {
	if (cachedValidator && cachedAjv) {
		return { ajv: cachedAjv, validate: cachedValidator };
	}

	// strict:false lets us use additionalProperties selectively without Ajv
	// complaining about every minor schema feature. allErrors:true returns
	// the full list rather than failing fast so the UI can surface multiple
	// problems at once.
	const ajv = new Ajv2020({ allErrors: true, strict: false });
	addFormats(ajv);

	for (const schema of SUB_SCHEMAS) {
		ajv.addSchema(schema);
	}
	const validate = ajv.compile(routineSpecSchema);

	cachedAjv = ajv;
	cachedValidator = validate;
	return { ajv, validate };
}

function normalizeErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
	if (!errors) return [];
	return errors.map((e) => ({
		path: e.instancePath || "/",
		keyword: e.keyword,
		message: e.message ?? "(no message)",
		params: (e.params as Record<string, unknown>) ?? {},
	}));
}

/**
 * Validate a V1 routine spec object. The argument should already be the
 * parsed-from-YAML JavaScript object; YAML parsing is the caller's
 * responsibility (and lives in the server's routine runner).
 *
 * Two-stage validation:
 *   1. Ajv structural validation against the JSON Schemas.
 *   2. Cross-reference pass: when a `layout` block is present, every edge
 *      `from`/`to` and every node key must reference an actual step id.
 *      Reported with a synthetic `crossRef` keyword + a JSON-Pointer path so
 *      the UI can surface them inline alongside Ajv errors.
 */
export function validateRoutineSpec(spec: unknown): ValidationResult {
	const { validate } = getValidator();
	const valid = validate(spec);
	if (!valid) {
		// Cast: Ajv attaches `.errors` to the compiled validator function.
		const errors = (validate as unknown as { errors?: ErrorObject[] | null }).errors;
		return { valid: false, errors: normalizeErrors(errors) };
	}

	const crossRef = checkLayoutCrossRefs(spec);
	if (crossRef.length > 0) {
		return { valid: false, errors: crossRef };
	}
	return { valid: true };
}

/**
 * Cross-reference pass for `layout`. JSON Schema can't express "this string
 * must match a sibling array's element ids", so we do it after structural
 * validation has guaranteed the shape. Bails early when the input is not an
 * object — Ajv already accepted it, but the type system does not know that.
 */
function checkLayoutCrossRefs(spec: unknown): ValidationError[] {
	if (!spec || typeof spec !== "object") return [];
	const layout = (spec as { layout?: unknown }).layout;
	if (!layout || typeof layout !== "object") return [];
	const stepsRaw = (spec as { steps?: unknown }).steps;
	if (!Array.isArray(stepsRaw)) return [];

	const stepIds = new Set<string>();
	for (const step of stepsRaw) {
		const id = (step as { id?: unknown })?.id;
		if (typeof id === "string") stepIds.add(id);
	}

	const errors: ValidationError[] = [];

	const nodes = (layout as { nodes?: unknown }).nodes;
	if (nodes && typeof nodes === "object" && !Array.isArray(nodes)) {
		for (const key of Object.keys(nodes)) {
			if (!stepIds.has(key)) {
				errors.push({
					path: `/layout/nodes/${encodePointer(key)}`,
					keyword: "crossRef",
					message: `layout.nodes references step id "${key}" which does not exist in steps[]`,
					params: { missingStepId: key },
				});
			}
		}
	}

	const edges = (layout as { edges?: unknown }).edges;
	if (Array.isArray(edges)) {
		for (let i = 0; i < edges.length; i++) {
			const edge = edges[i] as { from?: unknown; to?: unknown } | null;
			if (!edge || typeof edge !== "object") continue;
			for (const endpoint of ["from", "to"] as const) {
				const value = edge[endpoint];
				if (typeof value === "string" && !stepIds.has(value)) {
					errors.push({
						path: `/layout/edges/${i}/${endpoint}`,
						keyword: "crossRef",
						message: `layout.edges[${i}].${endpoint} references step id "${value}" which does not exist in steps[]`,
						params: { missingStepId: value },
					});
				}
			}
		}
	}

	return errors;
}

/** Encode a string for inclusion in a JSON Pointer per RFC 6901. */
function encodePointer(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * What the editor needs from the outside world, in two implementations: the
 * CLI's local server over HTTP, and an in-memory one for developing the
 * editor in a browser with no server at all.
 *
 * Diffing, linting and planning run in the browser with the engine; only
 * reading the database and applying a plan cross this seam. The server
 * recomputes the plan from `next` itself, so a client cannot send steps it
 * invented.
 */

import {
	completeSchema,
	diff,
	lint,
	hasErrors,
	materialize,
	plan,
	type Issue,
	type Schema,
	type Step
} from '@velastack/schema';

export interface AppliedStep {
	phase: number;
	kind: Step['kind'];
	name: string;
}

export interface ApplyResponse {
	/** The database as re-read after the apply, which becomes the new base. */
	base: Schema;
	applied: AppliedStep[];
	/** Migration files written, relative to the project's migrations directory. */
	written: string[];
	/** Set when a step was refused; `applied` holds the steps before it. */
	failed?: { step: AppliedStep; message: string };
}

export interface AiTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface AiEditRequest {
	prompt: string;
	schema: Schema;
	history?: AiTurn[];
}

export interface AiEditResponse {
	schema: Schema;
	summary: string;
	turn: AiTurn[];
}

/** The server has no AI for this session: not linked, not logged in, offline. */
export class AiUnavailable extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AiUnavailable';
	}
}

export class ApplyRefused extends Error {
	issues: Issue[];
	constructor(issues: Issue[]) {
		super('The schema has errors.');
		this.name = 'ApplyRefused';
		this.issues = issues;
	}
}

export interface SchemaApi {
	/** The database as it is. */
	load(): Promise<{ base: Schema; project?: string }>;
	/** Plan and apply the change from the current base to `next`. */
	apply(next: Schema): Promise<ApplyResponse>;
	/** Ask for the schema with a request in words applied; absent when the server has no AI. */
	ai?: (input: AiEditRequest) => Promise<AiEditResponse>;
	/** Why `ai` is missing, for the dock to say. */
	aiUnavailable?: string;
}

/** A client for the CLI's local server; `token` arrives once in the opening URL. */
export const httpApi = (token: string, origin = ''): SchemaApi => {
	const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
		const response = await fetch(`${origin}${path}`, {
			method,
			headers: { 'content-type': 'application/json', 'x-vela-schema-token': token },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
		if (response.status === 400 || response.status === 409 || response.status === 502) {
			const payload = (await response.json().catch(() => ({}))) as {
				issues?: Issue[];
				message?: string;
			};
			if (payload.issues) throw new ApplyRefused(payload.issues);
			if (response.status === 409)
				throw new AiUnavailable(payload.message ?? 'AI is not available');
			throw new Error(payload.message ?? `${method} ${path} failed (${response.status})`);
		}
		if (!response.ok) throw new Error(`${method} ${path} failed (${response.status})`);
		return (await response.json()) as T;
	};
	return {
		load: () => call('GET', '/api/schema'),
		apply: (next) => call('POST', '/api/apply', { next }),
		ai: (input) => call('POST', '/api/ai', input)
	};
};

/**
 * No server: "applying" makes the materialised next state the new base,
 * with the system fields PocketBase would add. Lint errors are refused the
 * way the real server refuses them.
 */
export const memoryApi = (initial: Schema): SchemaApi => {
	let base = completeSchema(initial);
	let stamp = Math.floor(Date.now() / 1000);
	return {
		aiUnavailable: 'AI needs the CLI: run vela generate migration --ai in a linked project.',
		load: async () => ({ base, project: 'in-memory' }),
		apply: async (next) => {
			const completed = completeSchema(next, base);
			const changes = diff(base, completed);
			const issues = lint(base, completed, changes);
			if (hasErrors(issues)) throw new ApplyRefused(issues);
			const steps = plan(base, completed, changes).steps;
			const written = steps.map((step) => {
				stamp += 1;
				const verb =
					step.kind === 'create' ? 'created' : step.kind === 'update' ? 'updated' : 'deleted';
				return `${stamp}_${verb}_${step.name}.js`;
			});
			base = completeSchema(materialize(completed, changes));
			return {
				base,
				applied: steps.map((step) => ({ phase: step.phase, kind: step.kind, name: step.name })),
				written
			};
		}
	};
};

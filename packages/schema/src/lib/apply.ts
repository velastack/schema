/**
 * Running a plan against PocketBase.
 *
 * The engine does not depend on the PocketBase SDK: callers hand it a small
 * client (`list`, `create`, `update`, `delete`) that the CLI implements with
 * the SDK and tests with `fetch`. PocketBase's automigrate writes one file
 * per save, named by the Unix second, so the applier waits for the clock to
 * advance between saves and the files sort in step order.
 */

import { collectionToPocketBase, type PocketBaseCollection } from './normalize/pocketbase.js';
import type { Plan, Step } from './plan.js';

export interface CollectionsClient {
	list(): Promise<PocketBaseCollection[]>;
	create(body: PocketBaseCollection): Promise<PocketBaseCollection>;
	update(id: string, body: PocketBaseCollection): Promise<PocketBaseCollection>;
	delete(id: string): Promise<void>;
}

export interface StepResult {
	step: Step;
	/** Unix seconds when the save was sent; the migration file carries this stamp. */
	at: number;
	collection?: PocketBaseCollection;
}

export interface ApplyResult {
	results: StepResult[];
	/** The step that failed and why; `results` holds the steps before it. */
	failed?: { step: Step; error: unknown };
}

export interface ApplyOptions {
	/** Called before each step. */
	onStep?: (step: Step, index: number, total: number) => void;
	/** Test seam: the clock in milliseconds and a sleep. */
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	/** Unix second of the last save made before this run, so the first step waits past it. */
	after?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A client over `fetch`, for anything without the PocketBase SDK: tests, the
 * editor's own dev mode. `token` is a superuser auth token.
 */
export const fetchClient = (
	url: string,
	token: string,
	fetchImpl: typeof fetch = fetch
): CollectionsClient => {
	const base = url.replace(/\/$/, '');
	const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
		const response = await fetchImpl(`${base}${path}`, {
			method,
			headers: { 'content-type': 'application/json', authorization: token },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
		}
		return (text ? JSON.parse(text) : undefined) as T;
	};
	return {
		list: async () =>
			(
				await call<{ items: PocketBaseCollection[] }>(
					'GET',
					'/api/collections?perPage=500&skipTotal=1'
				)
			).items,
		create: (body) => call('POST', '/api/collections', body),
		update: (id, body) => call('PATCH', `/api/collections/${id}`, body),
		delete: (id) => call('DELETE', `/api/collections/${id}`)
	};
};

/**
 * Apply every step in order, stopping at the first failure. Each save lands
 * in a distinct Unix second so PocketBase's migration files sort the way
 * the steps ran.
 */
export const apply = async (
	client: CollectionsClient,
	plan: Plan,
	options: ApplyOptions = {}
): Promise<ApplyResult> => {
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? defaultSleep;
	let last = options.after ?? 0;
	const results: StepResult[] = [];

	for (const [index, step] of plan.steps.entries()) {
		options.onStep?.(step, index, plan.steps.length);
		let second = Math.floor(now() / 1000);
		while (second <= last) {
			await sleep(Math.max(20, 1000 - (now() % 1000)));
			second = Math.floor(now() / 1000);
		}
		last = second;
		try {
			if (step.kind === 'delete') {
				await client.delete(step.collectionId);
				results.push({ step, at: second });
			} else {
				const body = collectionToPocketBase(step.collection);
				const collection =
					step.kind === 'create'
						? await client.create(body)
						: await client.update(step.collectionId, body);
				results.push({ step, at: second, collection });
			}
		} catch (error) {
			return { results, failed: { step, error } };
		}
	}
	return { results };
};

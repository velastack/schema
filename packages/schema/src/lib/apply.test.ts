import { describe, expect, it } from 'vitest';
import { apply, type CollectionsClient } from './apply.js';
import { plan } from './plan.js';
import { builtinSchema } from './normalize/builtins.js';
import type { PocketBaseCollection } from './normalize/pocketbase.js';
import { paymentsSchema } from './testing/fixtures.js';

/** A client that records calls and a clock that only moves when told to. */
const harness = (failOn?: string) => {
	const calls: string[] = [];
	let ms = 1_000_000_000_000; // some Unix second, exactly on the boundary
	const client: CollectionsClient = {
		list: async () => [],
		create: async (body) => {
			calls.push(`create ${body.name}`);
			if (body.name === failOn) throw new Error(`refused ${body.name}`);
			return body as PocketBaseCollection;
		},
		update: async (_id, body) => {
			calls.push(`update ${body.name}`);
			return body as PocketBaseCollection;
		},
		delete: async (id) => {
			calls.push(`delete ${id}`);
		}
	};
	const sleeps: number[] = [];
	return {
		client,
		calls,
		sleeps,
		now: () => ms,
		sleep: async (n: number) => {
			sleeps.push(n);
			ms += n;
		}
	};
};

describe('apply', () => {
	it('runs the steps in order and lands each in a distinct second', async () => {
		const base = builtinSchema();
		const next = paymentsSchema();
		const h = harness();
		const result = await apply(h.client, plan(base, next), { now: h.now, sleep: h.sleep });

		expect(result.failed).toBeUndefined();
		expect(h.calls).toEqual([
			'create stripe_customers',
			'create stripe_payment_methods',
			'update stripe_customers'
		]);
		const seconds = result.results.map((r) => r.at);
		expect(new Set(seconds).size).toBe(seconds.length);
		expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
	});

	it('waits past the second of a save made before this run', async () => {
		const h = harness();
		const start = Math.floor(h.now() / 1000);
		const result = await apply(h.client, plan(builtinSchema(), paymentsSchema()), {
			now: h.now,
			sleep: h.sleep,
			after: start
		});
		expect(result.results[0]!.at).toBeGreaterThan(start);
	});

	it('stops at the first failure and reports it with the steps before it', async () => {
		const h = harness('stripe_payment_methods');
		const result = await apply(h.client, plan(builtinSchema(), paymentsSchema()), {
			now: h.now,
			sleep: h.sleep
		});
		expect(result.results.map((r) => r.step.name)).toEqual(['stripe_customers']);
		expect(result.failed?.step.name).toBe('stripe_payment_methods');
		expect((result.failed?.error as Error).message).toContain('refused');
		expect(h.calls).toHaveLength(2);
	});

	it('reports progress', async () => {
		const h = harness();
		const seen: string[] = [];
		await apply(h.client, plan(builtinSchema(), paymentsSchema()), {
			now: h.now,
			sleep: h.sleep,
			onStep: (step, i, total) => seen.push(`${i + 1}/${total} ${step.name}`)
		});
		expect(seen).toEqual([
			'1/3 stripe_customers',
			'2/3 stripe_payment_methods',
			'3/3 stripe_customers'
		]);
	});
});

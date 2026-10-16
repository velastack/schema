import { describe, expect, it } from 'vitest';
import { cycles, topological } from './graph.js';

describe('cycles', () => {
	it('finds nothing in a tree', () => {
		expect(
			cycles(
				['a', 'b', 'c'],
				[
					{ from: 'b', to: 'a' },
					{ from: 'c', to: 'a' }
				]
			)
		).toEqual([]);
	});

	it('finds a two-node cycle and a self loop', () => {
		expect(
			cycles(
				['a', 'b', 'c', 'd'],
				[
					{ from: 'a', to: 'b' },
					{ from: 'b', to: 'a' },
					{ from: 'c', to: 'c' },
					{ from: 'd', to: 'a' }
				]
			)
		).toEqual([['a', 'b'], ['c']]);
	});

	it('ignores edges to unknown nodes', () => {
		expect(cycles(['a'], [{ from: 'a', to: 'zzz' }])).toEqual([]);
	});
});

describe('topological', () => {
	it('emits dependencies first and keeps input order for ties', () => {
		const { order, deferred } = topological(
			['books', 'authors', 'readers'],
			[{ from: 'books', to: 'authors' }]
		);
		expect(order).toEqual(['authors', 'readers', 'books']);
		expect(deferred).toEqual([]);
	});

	it('breaks cycles at the earliest node and reports the deferred edges', () => {
		const { order, deferred } = topological(
			['customers', 'methods'],
			[
				{ from: 'customers', to: 'methods' },
				{ from: 'methods', to: 'customers' }
			]
		);
		expect(order).toEqual(['customers', 'methods']);
		expect(deferred).toEqual([{ from: 'customers', to: 'methods' }]);
	});

	it('always defers self edges', () => {
		const { order, deferred } = topological(['cats'], [{ from: 'cats', to: 'cats' }]);
		expect(order).toEqual(['cats']);
		expect(deferred).toEqual([{ from: 'cats', to: 'cats' }]);
	});
});

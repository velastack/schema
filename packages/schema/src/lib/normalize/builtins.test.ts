import { describe, expect, it } from 'vitest';
import { diff } from '../diff.js';
import { collection, text } from '../testing/fixtures.js';
import { completeCollection, completeSchema, usersCollection } from './builtins.js';

describe('completeCollection', () => {
	it('adds the system id field to a base collection', () => {
		const done = completeCollection(collection('books', [text('title')]));
		expect(done.fields.map((f) => f.name)).toEqual(['id', 'title']);
		expect(done.fields[0]!.id).toBe('text3208210256');
	});

	it('adds the six auth system fields to an auth collection', () => {
		const done = completeCollection(collection('staff', [text('name')], { type: 'auth' }));
		expect(done.fields.map((f) => f.name)).toEqual([
			'id',
			'password',
			'tokenKey',
			'email',
			'emailVisibility',
			'verified',
			'name'
		]);
	});

	it('adds the two unique indexes PocketBase gives an auth collection', () => {
		const done = completeCollection(collection('staff', [], { type: 'auth' }));
		expect(done.indexes).toEqual([
			'CREATE UNIQUE INDEX `idx_tokenKey_pbc_staff` ON `staff` (`tokenKey`)',
			"CREATE UNIQUE INDEX `idx_email_pbc_staff` ON `staff` (`email`) WHERE `email` != ''"
		]);
		// An index on the same column, however named, counts as present.
		const own = collection('staff', [], {
			type: 'auth',
			indexes: ['CREATE UNIQUE INDEX `my_tokens` ON `staff` (`tokenKey`)']
		});
		expect(completeCollection(own).indexes).toHaveLength(2);
	});

	it('leaves views and already complete collections alone', () => {
		const view = collection('v', [text('x')], { type: 'view', viewQuery: 'SELECT id FROM users' });
		expect(completeCollection(view)).toBe(view);
		const users = usersCollection();
		expect(completeCollection(users)).toBe(users);
	});

	it('makes a hand-built schema diff clean against what PocketBase stores', () => {
		const hand = { collections: [collection('books', [text('title')])] };
		const stored = completeSchema(hand);
		expect(diff(stored, completeSchema(hand)).ops).toEqual([]);
		expect(diff(stored, hand).ops.map((op) => op.kind)).toEqual(['dropField']);
	});
});

import { describe, expect, it } from 'vitest';
import { diff } from './diff.js';
import { hasErrors, lint, lintChangeSet, lintSchema } from './lint.js';
import { builtinSchema, usersCollection } from './normalize/builtins.js';
import {
	USERS,
	byName,
	clone,
	collection,
	librarySchema,
	paymentsSchema,
	relation,
	schema,
	selfRelationSchema,
	teamsSchema,
	text
} from './testing/fixtures.js';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort();

describe('lintSchema', () => {
	it('passes the real pattern schemas with at most informational notes', () => {
		expect(lintSchema(teamsSchema()).filter((i) => i.level !== 'info')).toEqual([]);
		const payments = lintSchema(paymentsSchema());
		expect(payments.filter((i) => i.level === 'error')).toEqual([]);
		expect(codes(payments)).toContain('relation-cycle');
	});

	it('flags a cycle where both sides are required as an error', () => {
		const s = paymentsSchema();
		for (const c of s.collections) {
			for (const f of c.fields)
				if (f.type === 'relation' && f.collectionId !== USERS) f.required = true;
		}
		const issues = lintSchema(s);
		expect(codes(issues)).toContain('relation-cycle-required');
		expect(hasErrors(issues)).toBe(true);
		const issue = issues.find((i) => i.code === 'relation-cycle-required')!;
		expect(issue.related).toEqual(['pbc_stripe_customers', 'pbc_stripe_payment_methods']);
	});

	it('notes a self-relation as informational', () => {
		const issues = lintSchema(selfRelationSchema());
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			level: 'info',
			code: 'relation-self',
			fieldId: 'relation_parent'
		});
	});

	it('warns about cascade cycles and required relations inside them', () => {
		const s = paymentsSchema();
		const dpm = byName(s, 'stripe_customers').fields[1]!;
		if (dpm.type === 'relation') {
			dpm.cascadeDelete = true;
			dpm.required = true;
		}
		expect(codes(lintSchema(s))).toEqual(
			expect.arrayContaining(['cascade-cycle', 'cascade-cycle-required'])
		);
	});

	it('rejects dangling relation targets', () => {
		const s = schema(collection('books', [relation('author', 'pbc_nowhere')]));
		expect(lintSchema(s)).toMatchObject([{ level: 'error', code: 'relation-missing-target' }]);
	});

	it('rejects a base collection relating to a view', () => {
		const s = schema(
			collection('v', [text('x')], { type: 'view', viewQuery: 'SELECT id FROM users' }),
			collection('b', [relation('view', 'pbc_v')])
		);
		expect(codes(lintSchema(s))).toContain('relation-to-view');
	});

	it('checks names', () => {
		const s = schema(
			collection('bad name', [text('ok')]),
			collection('Users', [text('expand'), text('x'), text('X')]),
			usersCollection()
		);
		expect(codes(lintSchema(s))).toEqual([
			'collection-name',
			'collection-name-duplicate',
			'field-name-duplicate',
			'field-name-reserved'
		]);
	});

	it('checks select and autodate options', () => {
		const s = schema(
			collection('a', [
				{ id: 's1', name: 'status', type: 'select', values: [] },
				{ id: 's2', name: 'tags', type: 'select', values: ['a', 'b'], maxSelect: 5 },
				{ id: 'd1', name: 'stamp', type: 'autodate' }
			])
		);
		expect(codes(lintSchema(s))).toEqual([
			'autodate-no-trigger',
			'select-max-exceeds-values',
			'select-no-values'
		]);
	});

	it('rejects indexes on views', () => {
		const s = schema(
			collection('v', [], {
				type: 'view',
				viewQuery: 'SELECT id FROM users',
				indexes: ['CREATE INDEX x ON v (id)']
			})
		);
		expect(codes(lintSchema(s))).toEqual(['view-indexes']);
	});
});

describe('lintChangeSet', () => {
	it('lists the referrers when a collection is dropped', () => {
		const base = librarySchema();
		const next = clone(base);
		next.collections = next.collections.filter((c) => c.name !== 'authors');
		const books = byName(next, 'books');
		books.fields = books.fields.filter((f) => f.name !== 'author');

		const issues = lintChangeSet(base, next, diff(base, next));
		const drop = issues.find((i) => i.code === 'drop-collection')!;
		expect(drop.level).toBe('warning');
		expect(drop.message).toContain('books');
		expect(drop.related).toEqual(['pbc_books']);
		expect(codes(issues)).toContain('drop-field');
	});

	it('marks type changes as destructive warnings', () => {
		const base = librarySchema();
		const next = clone(base);
		(byName(next, 'books').fields[0] as { type: string }).type = 'number';
		const issues = lint(base, next, diff(base, next));
		expect(issues).toMatchObject([{ level: 'warning', code: 'field-type-change' }]);
	});

	it('warns when a multi-value field becomes single-value', () => {
		const base = schema(
			collection('a', [relation('tags', USERS, { maxSelect: 99 })]),
			usersCollection()
		);
		const next = clone(base);
		const tags = byName(next, 'a').fields[0]!;
		if (tags.type === 'relation') tags.maxSelect = 1;
		expect(codes(lintChangeSet(base, next, diff(base, next)))).toEqual(['field-narrowed']);
	});

	it('refuses to drop, rename or retype system fields', () => {
		const base = builtinSchema();
		const next = clone(base);
		const users = byName(next, 'users');
		users.fields = users.fields.filter((f) => f.name !== 'tokenKey');
		users.fields.find((f) => f.name === 'email')!.name = 'mail';
		users.fields.find((f) => f.name === 'verified')!.required = true;

		const issues = lintChangeSet(base, next, diff(base, next));
		expect(codes(issues)).toEqual([
			'drop-system-field',
			'rename-system-field',
			'update-system-field'
		]);
		expect(hasErrors(issues)).toBe(true);
	});

	it('allows hiding a system field', () => {
		const base = builtinSchema();
		const next = clone(base);
		byName(next, 'users').fields.find((f) => f.name === 'email')!.hidden = true;
		expect(lintChangeSet(base, next, diff(base, next))).toEqual([]);
	});
});

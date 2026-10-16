import { describe, expect, it } from 'vitest';
import { annotate, diagramOf, diagramSchema } from './annotate.js';
import { diff } from './diff.js';
import { layout } from './layout.js';
import { builtinSchema } from './normalize/builtins.js';
import { applyPatternResult } from './normalize/patterns.js';
import {
	USERS,
	byName,
	clone,
	collection,
	librarySchema,
	relation,
	schema,
	teamsSchema,
	text
} from './testing/fixtures.js';

const statuses = (d: ReturnType<typeof annotate>) =>
	Object.fromEntries(d.collections.map((c) => [c.collection.name, c.status]));

describe('annotate', () => {
	it('draws a plain schema with everything unchanged', () => {
		const d = diagramOf(teamsSchema());
		expect(Object.values(statuses(d))).toEqual([
			'unchanged',
			'unchanged',
			'unchanged',
			'unchanged'
		]);
		expect(d.edges).toHaveLength(4);
		expect(d.edges.every((e) => e.status === 'unchanged')).toBe(true);
		expect(d.collections.find((c) => c.collection.name === 'users')!.locked).toBe(false);
	});

	it('marks created collections and includes their relation targets under focus "changes"', () => {
		const base = builtinSchema();
		const next = teamsSchema();
		const d = annotate(base, next, diff(base, next), { focus: 'changes' });
		expect(statuses(d)).toEqual({
			users: 'unchanged',
			teams: 'created',
			team_memberships: 'created',
			team_invites: 'created'
		});
		expect(d.edges.every((e) => e.status === 'added')).toBe(true);
		const membership = d.edges.filter((e) => e.from === 'pbc_team_memberships');
		expect(membership.map((e) => e.cascade)).toEqual([true, true]);
	});

	it('leaves out untouched collections under focus "changes"', () => {
		const base = teamsSchema();
		const next = clone(base);
		byName(next, 'team_invites').fields.push(text('message'));
		const d = annotate(base, next, diff(base, next), { focus: 'changes' });
		expect(statuses(d)).toEqual({ team_invites: 'changed', teams: 'unchanged' });
	});

	it('keeps removed fields in their old slot and labels renames and replacements', () => {
		const base = schema(collection('a', [text('one'), text('two'), text('three'), text('four')]));
		const next = clone(base);
		const a = byName(next, 'a');
		a.fields = [
			a.fields[0]!,
			{ ...a.fields[2]!, name: 'tres' },
			{ ...a.fields[3]!, type: 'editor' } as never,
			text('five')
		];
		const changes = diff(base, next);
		const d = annotate(base, next, changes);
		const rows = d.collections[0]!.fields.map((f) => `${f.status}:${f.field.name}`);
		expect(rows).toEqual([
			'unchanged:one',
			'removed:two',
			'renamed:tres',
			'replaced:four',
			'added:five'
		]);
		expect(d.collections[0]!.fields[2]).toMatchObject({ previousName: 'three' });
		expect(d.collections[0]!.fields[3]).toMatchObject({ previousType: 'text' });
		expect(d.collections[0]!.status).toBe('changed');
	});

	it('draws dropped collections with removed edges', () => {
		const base = librarySchema();
		const next = clone(base);
		next.collections = next.collections.filter((c) => c.name !== 'books');
		const d = annotate(base, next);
		expect(statuses(d)).toEqual({ authors: 'unchanged', books: 'dropped' });
		expect(d.edges).toEqual([
			expect.objectContaining({ from: 'pbc_books', to: 'pbc_authors', status: 'removed' })
		]);
		expect(
			d.collections.find((c) => c.status === 'dropped')!.fields.every((f) => f.status === 'removed')
		).toBe(true);
	});

	it('records a collection rename', () => {
		const base = librarySchema();
		const next = clone(base);
		byName(next, 'books').name = 'publications';
		const d = annotate(base, next);
		expect(d.collections.find((c) => c.collection.name === 'publications')).toMatchObject({
			status: 'changed',
			previousName: 'books'
		});
	});

	it('locks system and underscore collections', () => {
		const d = diagramOf(
			schema(
				collection('_superusers', [], { system: true, type: 'auth' }),
				collection('_whatsapp', []),
				collection('posts', [])
			)
		);
		expect(d.collections.map((c) => c.locked)).toEqual([true, true, false]);
	});

	it('omits edges whose target is not drawn', () => {
		const base = schema();
		const next = schema(collection('posts', [relation('author', USERS)]));
		const d = annotate(base, next, diff(base, next), { focus: 'changes' });
		expect(d.edges).toEqual([]);
	});

	it('lays out a diagram sized for the fields it shows', () => {
		const base = librarySchema();
		const next = clone(base);
		byName(next, 'books').fields = [byName(next, 'books').fields[0]!];
		const d = annotate(base, next);
		const sized = diagramSchema(d);
		expect(byName(sized, 'books').fields).toHaveLength(2);
		const result = layout(sized);
		expect(Object.keys(result.nodes)).toHaveLength(2);
	});

	it('reads a pattern result into a focused diagram', () => {
		const base = builtinSchema();
		const next = applyPatternResult(base, {
			collections: [
				{
					name: 'api_keys',
					type: 'base',
					fields: [
						{ name: 'name', type: 'text', required: true },
						{ name: 'user', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 }
					]
				}
			]
		});
		const d = annotate(base, next, diff(base, next), { focus: 'changes' });
		expect(statuses(d)).toEqual({ users: 'unchanged', api_keys: 'created' });
		expect(d.edges).toEqual([
			expect.objectContaining({ to: USERS, status: 'added', multiple: false })
		]);
	});
});

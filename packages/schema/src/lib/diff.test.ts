import { describe, expect, it } from 'vitest';
import { diff, destructiveOps, summarize } from './diff.js';
import {
	byName,
	clone,
	collection,
	librarySchema,
	relation,
	schema,
	teamsSchema,
	text
} from './testing/fixtures.js';

describe('diff', () => {
	it('is empty for identical schemas', () => {
		expect(diff(teamsSchema(), teamsSchema()).ops).toEqual([]);
	});

	it('treats a kept id with a new name as a rename, not a drop and add', () => {
		const base = librarySchema();
		const next = clone(base);
		byName(next, 'books').fields[1]!.name = 'writer';
		byName(next, 'books').name = 'publications';

		const { ops } = diff(base, next);
		expect(ops.map((op) => op.kind)).toEqual(['renameCollection', 'renameField']);
		expect(ops[1]).toMatchObject({ fieldId: 'relation_author', from: 'author', to: 'writer' });
		expect(destructiveOps({ ops })).toEqual([]);
	});

	it('reports a dropped id and a new id separately', () => {
		const base = librarySchema();
		const next = clone(base);
		const books = byName(next, 'books');
		books.fields = [books.fields[0]!, text('isbn')];

		const { ops } = diff(base, next);
		expect(ops.map((op) => op.kind).sort()).toEqual(['addField', 'dropField']);
		expect(ops.find((op) => op.kind === 'dropField')).toMatchObject({ name: 'author' });
		expect(ops.find((op) => op.kind === 'addField')).toMatchObject({ position: 1 });
	});

	it('turns a type change into a replacement with a fresh id', () => {
		const base = librarySchema();
		const next = clone(base);
		const title = byName(next, 'books').fields[0]!;
		(title as { type: string }).type = 'editor';

		const { ops } = diff(base, next);
		expect(ops).toHaveLength(1);
		const op = ops[0]!;
		expect(op.kind).toBe('replaceField');
		if (op.kind !== 'replaceField') return;
		expect(op.reason).toBe('type');
		expect(op.from.id).toBe('text_title');
		expect(op.to.id).not.toBe('text_title');
		expect(op.to.id.startsWith('editor')).toBe(true);
		expect(op.to.name).toBe('title');
	});

	it('turns a relation target change into a replacement', () => {
		const base = teamsSchema();
		const next = clone(base);
		const owner = byName(next, 'teams').fields[1]!;
		if (owner.type === 'relation') owner.collectionId = 'pbc_team_invites';

		const { ops } = diff(base, next);
		expect(ops).toHaveLength(1);
		expect(ops[0]).toMatchObject({ kind: 'replaceField', reason: 'target' });
	});

	it('ignores zero-valued options PocketBase adds on read', () => {
		const base = schema(collection('a', [text('name')]));
		const next = schema(
			collection('a', [text('name', { min: 0, max: 0, pattern: '', hidden: false } as never)])
		);
		expect(diff(base, next).ops).toEqual([]);
	});

	it("keeps 0 distinct from null for a number field's bounds", () => {
		const base = schema(collection('a', [{ id: 'n', name: 'qty', type: 'number', min: null }]));
		const next = schema(collection('a', [{ id: 'n', name: 'qty', type: 'number', min: 0 }]));
		expect(diff(base, next).ops).toMatchObject([{ kind: 'updateField', changed: ['min'] }]);
		const textBase = schema(collection('a', [text('t')]));
		const textNext = schema(collection('a', [text('t', { min: 0 } as never)]));
		expect(diff(textBase, textNext).ops).toEqual([]);
	});

	it('reports changed options by name', () => {
		const base = librarySchema();
		const next = clone(base);
		const title = byName(next, 'books').fields[0]!;
		title.required = true;
		if (title.type === 'text') title.max = 200;

		const { ops } = diff(base, next);
		expect(ops).toHaveLength(1);
		expect(ops[0]).toMatchObject({ kind: 'updateField', changed: ['max', 'required'] });
	});

	it('diffs rules and indexes at the collection level', () => {
		const base = librarySchema();
		const next = clone(base);
		const books = byName(next, 'books');
		books.rules = { ...books.rules, list: '', view: '' };
		books.indexes = ['CREATE INDEX `idx_books_title` ON `books` (`title`)'];

		const { ops } = diff(base, next);
		expect(ops.map((op) => op.kind)).toEqual(['updateRules', 'updateIndexes']);
		expect(ops[1]).toMatchObject({ added: books.indexes, removed: [] });
	});

	it('does not diff the fields of a view, only its query', () => {
		const base = schema(
			collection('v', [text('id'), text('name')], {
				type: 'view',
				viewQuery: 'SELECT id, name FROM a'
			})
		);
		const next = schema(
			collection('v', [], { type: 'view', viewQuery: 'SELECT id, name, email FROM a' })
		);
		expect(diff(base, next).ops.map((op) => op.kind)).toEqual(['updateViewQuery']);
	});

	it('cannot change a collection type in place, so it drops and recreates', () => {
		const base = librarySchema();
		const next = clone(base);
		byName(next, 'authors').type = 'auth';

		const { ops } = diff(base, next);
		expect(ops.map((op) => op.kind)).toEqual(['dropCollection', 'createCollection']);
	});

	it('summarises created, dropped, changed and destructive counts', () => {
		const base = librarySchema();
		const next = clone(base);
		next.collections = next.collections.filter((c) => c.name !== 'authors');
		const books = byName(next, 'books');
		books.fields = [books.fields[0]!];
		next.collections.push(collection('readers', [text('name'), relation('book', 'pbc_books')]));

		const summary = summarize(diff(base, next));
		expect(summary).toEqual({ created: 1, dropped: 1, changed: 1, destructive: 2, total: 3 });
	});
});

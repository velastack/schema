import { describe, expect, it } from 'vitest';
import { diagramOf, layout, type Schema } from '@velastack/schema';
import { edgePath, edgePaths } from './edges.js';

const schema: Schema = {
	collections: [
		{
			id: 'pbc_books',
			name: 'books',
			type: 'base',
			indexes: [],
			rules: { list: null, view: null, create: null, update: null, delete: null },
			fields: [
				{ id: 'text_title', name: 'title', type: 'text' },
				{
					id: 'relation_author',
					name: 'author',
					type: 'relation',
					collectionId: 'pbc_authors',
					maxSelect: 1
				},
				{
					id: 'relation_sequel',
					name: 'sequel',
					type: 'relation',
					collectionId: 'pbc_books',
					maxSelect: 1
				}
			]
		},
		{
			id: 'pbc_authors',
			name: 'authors',
			type: 'base',
			indexes: [],
			rules: { list: null, view: null, create: null, update: null, delete: null },
			fields: [{ id: 'text_name', name: 'name', type: 'text' }]
		}
	]
};

const diagram = diagramOf(schema);

describe('edgePath', () => {
	it('leaves the owning row on the side facing the target and lands on the target header', () => {
		const placed = {
			nodes: {
				pbc_books: { id: 'pbc_books', x: 0, y: 0, width: 240, height: 120 },
				pbc_authors: { id: 'pbc_authors', x: 400, y: 0, width: 240, height: 70 }
			},
			width: 700,
			height: 200
		};
		const path = edgePath(
			diagram,
			placed,
			diagram.edges.find((e) => e.fieldId === 'relation_author')!
		)!;
		expect(path.direction).toBe(1);
		expect(path.from.x).toBe(240);
		expect(path.from.y).toBe(36 + 26 + 13); // header + one row + half a row
		expect(path.to).toEqual({ x: 400, y: 18 });
		expect(path.d.startsWith('M 240 75 C')).toBe(true);
	});

	it('flips direction when the target sits to the left', () => {
		const placed = {
			nodes: {
				pbc_books: { id: 'pbc_books', x: 400, y: 0, width: 240, height: 120 },
				pbc_authors: { id: 'pbc_authors', x: 0, y: 0, width: 240, height: 70 }
			},
			width: 700,
			height: 200
		};
		const path = edgePath(
			diagram,
			placed,
			diagram.edges.find((e) => e.fieldId === 'relation_author')!
		)!;
		expect(path.direction).toBe(-1);
		expect(path.from.x).toBe(400);
		expect(path.to.x).toBe(240);
	});

	it('loops a self-relation out of and back into the right edge', () => {
		const placed = layout(schema);
		const path = edgePath(
			diagram,
			placed,
			diagram.edges.find((e) => e.fieldId === 'relation_sequel')!
		)!;
		const right = placed.nodes['pbc_books']!.x + placed.nodes['pbc_books']!.width;
		expect(path.from.x).toBe(right);
		expect(path.to.x).toBe(right);
		expect(path.from.y).toBeGreaterThan(path.to.y);
	});

	it('skips edges whose collection or field is not drawn', () => {
		const placed = layout(schema);
		expect(
			edgePath(diagram, placed, {
				from: 'pbc_books',
				fieldId: 'nope',
				to: 'pbc_authors',
				status: 'unchanged',
				multiple: false,
				cascade: false
			})
		).toBeUndefined();
		expect(
			edgePath(diagram, placed, {
				from: 'pbc_ghost',
				fieldId: 'x',
				to: 'pbc_authors',
				status: 'unchanged',
				multiple: false,
				cascade: false
			})
		).toBeUndefined();
		expect(edgePaths(diagram, placed)).toHaveLength(2);
	});
});

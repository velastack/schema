import { describe, expect, it } from 'vitest';
import { defaultNodeSize, layout } from './layout.js';
import { paymentsSchema, teamsSchema } from './testing/fixtures.js';

const overlaps = (
	a: { x: number; y: number; width: number; height: number },
	b: { x: number; y: number; width: number; height: number }
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('layout', () => {
	it('places every collection without overlap and sizes cards by field count', () => {
		const schema = teamsSchema();
		const result = layout(schema);
		const placed = Object.values(result.nodes);
		expect(placed).toHaveLength(schema.collections.length);
		for (const node of placed) {
			const collection = schema.collections.find((c) => c.id === node.id)!;
			expect({ width: node.width, height: node.height }).toEqual(defaultNodeSize(collection));
			expect(node.x).toBeGreaterThanOrEqual(0);
			expect(node.y).toBeGreaterThanOrEqual(0);
		}
		for (let i = 0; i < placed.length; i++) {
			for (let j = i + 1; j < placed.length; j++) {
				expect(overlaps(placed[i]!, placed[j]!)).toBe(false);
			}
		}
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
	});

	it('puts relation targets to the right of their owners left-to-right', () => {
		const schema = teamsSchema();
		const { nodes } = layout(schema, { direction: 'LR' });
		expect(nodes['pbc_team_memberships']!.x).toBeLessThan(nodes['pbc_teams']!.x);
		expect(nodes['pbc_teams']!.x).toBeLessThan(nodes['_pb_users_auth_']!.x);
	});

	it('survives cycles', () => {
		const result = layout(paymentsSchema());
		expect(Object.keys(result.nodes)).toHaveLength(3);
	});

	it('is deterministic', () => {
		expect(layout(teamsSchema())).toEqual(layout(teamsSchema()));
	});
});

import { describe, expect, it } from 'vitest';
import { plan, type Step } from './plan.js';
import { crc32 } from './ids.js';
import { builtinSchema } from './normalize/builtins.js';
import { isRelation, type Schema } from './types.js';
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

const describeSteps = (steps: Step[]) => steps.map((s) => `${s.phase}:${s.kind}:${s.name}`);

const fieldNames = (step: Step) =>
	step.kind === 'delete' ? [] : step.collection.fields.map((f) => f.name);

/** Replays a plan against `base` the way PocketBase would, enforcing its three rules. */
const simulate = (base: Schema, steps: Step[]): Schema => {
	const state = clone(base);
	const exists = (id: string) => state.collections.some((c) => c.id === id);
	for (const step of steps) {
		if (step.kind === 'delete') {
			const referrer = state.collections.find(
				(c) =>
					c.id !== step.collectionId &&
					c.fields.some((f) => isRelation(f) && f.collectionId === step.collectionId)
			);
			if (referrer) throw new Error(`cannot delete ${step.name}: referenced by ${referrer.name}`);
			state.collections = state.collections.filter((c) => c.id !== step.collectionId);
			continue;
		}
		for (const field of step.collection.fields) {
			if (
				isRelation(field) &&
				!exists(field.collectionId) &&
				field.collectionId !== step.collectionId
			) {
				throw new Error(`${step.name}.${field.name}: relation target does not exist`);
			}
			if (isRelation(field) && field.collectionId === step.collectionId && step.kind === 'create') {
				throw new Error(`${step.name}.${field.name}: self relation on create`);
			}
		}
		if (step.kind === 'create') {
			if (exists(step.collectionId)) throw new Error(`${step.name} already exists`);
			state.collections.push(clone(step.collection));
		} else {
			const index = state.collections.findIndex((c) => c.id === step.collectionId);
			if (index < 0) throw new Error(`${step.name} does not exist`);
			state.collections[index] = clone(step.collection);
		}
	}
	return state;
};

const sameShape = (a: Schema, b: Schema) =>
	JSON.stringify([...a.collections].sort((x, y) => x.id.localeCompare(y.id))) ===
	JSON.stringify([...b.collections].sort((x, y) => x.id.localeCompare(y.id)));

describe('plan', () => {
	it('creates collections that only relate to existing ones in one step each', () => {
		const base = builtinSchema();
		const next = teamsSchema();
		const { steps } = plan(base, next);

		expect(describeSteps(steps)).toEqual([
			'3:create:teams',
			'3:create:team_memberships',
			'3:create:team_invites'
		]);
		expect(fieldNames(steps[1]!)).toContain('team');
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('defers the back-reference of a cycle to a fourth phase', () => {
		const base = builtinSchema();
		const next = paymentsSchema();
		const { steps } = plan(base, next);

		expect(describeSteps(steps)).toEqual([
			'3:create:stripe_customers',
			'3:create:stripe_payment_methods',
			'4:update:stripe_customers'
		]);
		expect(fieldNames(steps[0]!)).not.toContain('default_payment_method');
		expect(fieldNames(steps[2]!)).toContain('default_payment_method');
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('defers a self-relation', () => {
		const base = schema();
		const next = selfRelationSchema();
		const { steps } = plan(base, next);

		expect(describeSteps(steps)).toEqual(['3:create:categories', '4:update:categories']);
		expect(fieldNames(steps[0]!)).toEqual(['title']);
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('strips relation fields from survivors before deleting their target', () => {
		const base = librarySchema();
		const next = clone(base);
		next.collections = next.collections.filter((c) => c.name !== 'authors');
		const books = byName(next, 'books');
		books.fields = books.fields.filter((f) => f.name !== 'author');

		const { steps } = plan(base, next);
		expect(describeSteps(steps)).toEqual(['1:update:books', '2:delete:authors']);
		expect(fieldNames(steps[0]!)).toEqual(['title']);
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('deletes referrers before targets without extra updates', () => {
		const base = librarySchema();
		const next = schema();
		const { steps } = plan(base, next);

		expect(describeSteps(steps)).toEqual(['2:delete:books', '2:delete:authors']);
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('breaks a cycle among dropped collections before deleting', () => {
		const base = paymentsSchema();
		const next = builtinSchema();
		const { steps } = plan(base, next);

		expect(steps.filter((s) => s.phase === 1)).toHaveLength(1);
		expect(steps.filter((s) => s.phase === 2)).toHaveLength(2);
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('does not strip a self-relation before deleting its collection', () => {
		const base = selfRelationSchema();
		const { steps } = plan(base, schema());
		expect(describeSteps(steps)).toEqual(['2:delete:categories']);
	});

	it('updates existing collections after creates so new targets exist', () => {
		const base = librarySchema();
		const next = clone(base);
		next.collections.push(collection('publishers', [text('name')]));
		byName(next, 'books').fields.push(relation('publisher', 'pbc_publishers'));

		const { steps } = plan(base, next);
		expect(describeSteps(steps)).toEqual(['3:create:publishers', '3:update:books']);
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('carries the full desired state on an update so renames and option changes ride along', () => {
		const base = librarySchema();
		const next = clone(base);
		const books = byName(next, 'books');
		books.name = 'publications';
		books.fields[0]!.required = true;

		const { steps } = plan(base, next);
		expect(describeSteps(steps)).toEqual(['3:update:publications']);
		expect(steps[0]!.ops.map((op) => op.kind)).toEqual(['renameCollection', 'updateField']);
		expect(sameShape(simulate(base, steps), next)).toBe(true);
	});

	it('creates views after the base collections they read', () => {
		const base = builtinSchema();
		const next = teamsSchema();
		next.collections.push(
			collection('team_users', [text('team'), text('user')], {
				type: 'view',
				viewQuery: 'SELECT id, team, user FROM team_memberships'
			})
		);
		next.collections.sort((a, b) => a.name.localeCompare(b.name));

		const { steps } = plan(base, next);
		const names = steps.map((s) => s.name);
		expect(names.indexOf('team_users')).toBeGreaterThan(names.indexOf('team_memberships'));
		expect(names.indexOf('team_users')).toBeGreaterThan(names.indexOf('teams'));
	});

	it('handles a relation to users from a new collection without deferral', () => {
		const base = builtinSchema();
		const next = schema(
			...base.collections,
			collection('posts', [text('body'), relation('author', USERS)])
		);
		const { steps } = plan(base, next);
		expect(describeSteps(steps)).toEqual(['3:create:posts']);
		expect(fieldNames(steps[0]!)).toContain('author');
	});
});

describe('materialize', () => {
	it('gives a retyped field its new id in the update body', () => {
		const base = librarySchema();
		const next = clone(base);
		(byName(next, 'books').fields[0] as { type: string }).type = 'editor';

		const { steps } = plan(base, next);
		expect(describeSteps(steps)).toEqual(['3:update:books']);
		const title = (
			steps[0] as { collection: { fields: { id: string; name: string; type: string }[] } }
		).collection.fields.find((f) => f.name === 'title')!;
		expect(title.type).toBe('editor');
		expect(title.id).toBe('editor' + '3208210256'.replace(/.*/, String(crc32('title'))));
		expect(title.id).not.toBe('text_title');
	});

	it('gives a retargeted relation a different id even though type and name are unchanged', () => {
		const base = teamsSchema();
		const next = clone(base);
		const owner = byName(next, 'teams').fields[1]!;
		if (owner.type === 'relation') owner.collectionId = 'pbc_team_invites';

		const { steps } = plan(base, next);
		const field = (
			steps[0] as { collection: { fields: { id: string; name: string }[] } }
		).collection.fields.find((f) => f.name === 'owner')!;
		expect(field.id).not.toBe('relation_owner');
		expect(field.id).toMatch(/^relation\d+$/);
	});
});

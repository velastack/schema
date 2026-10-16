import { describe, expect, it } from 'vitest';
import { diff } from '../diff.js';
import { USERS_COLLECTION_ID, seededIds } from '../ids.js';
import { lintSchema } from '../lint.js';
import { plan } from '../plan.js';
import { byName } from '../testing/fixtures.js';
import { isRelation } from '../types.js';
import { builtinSchema } from './builtins.js';
import { applyPatternResult, resolveTarget, type PatternResult } from './patterns.js';

/** enable-teams, as the pattern's preview emits it (targets by name and by real id). */
const teamsResult: PatternResult = {
	collections: [
		{
			name: 'teams',
			type: 'base',
			listRule: 'team_memberships_via_team.user ?= @request.auth.id || owner = @request.auth.id',
			fields: [
				{ name: 'name', type: 'text', required: true },
				{ name: 'owner', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 }
			]
		},
		{
			name: 'team_memberships',
			type: 'base',
			fields: [
				{
					name: 'team',
					type: 'relation',
					collectionId: 'teams',
					maxSelect: 1,
					cascadeDelete: true
				},
				{ name: 'user', type: 'relation', collectionId: 'users', maxSelect: 1, cascadeDelete: true }
			]
		}
	],
	collectionPatches: [],
	collectionDrops: []
};

describe('applyPatternResult', () => {
	it('creates collections with deterministic ids and a system id field', () => {
		const once = applyPatternResult(builtinSchema(), teamsResult);
		const twice = applyPatternResult(builtinSchema(), teamsResult);
		expect(once).toEqual(twice);

		const teams = byName(once, 'teams');
		expect(teams.id).toMatch(/^pbc_\d{10}$/);
		expect(teams.fields.map((f) => f.name)).toEqual(['id', 'name', 'owner']);
		expect(teams.fields[0]).toMatchObject({ system: true, primaryKey: true });
		expect(teams.fields[2]!.id).toMatch(/^relation\d{10}$/);
		expect(teams.rules.list).toContain('team_memberships_via_team');
	});

	it('resolves relation targets given by id, by name and by preview id', () => {
		const after = applyPatternResult(builtinSchema(), {
			collections: [
				...teamsResult.collections,
				{
					name: 'projects',
					type: 'base',
					fields: [
						{ name: 'team', type: 'relation', collectionId: 'teams_preview', maxSelect: 1 },
						{ name: 'owner', type: 'relation', collectionId: 'users_preview', maxSelect: 1 }
					]
				}
			]
		});
		const targets = Object.fromEntries(
			after.collections.flatMap((c) =>
				c.fields.filter(isRelation).map((f) => [`${c.name}.${f.name}`, f.collectionId])
			)
		);
		const teamsId = byName(after, 'teams').id;
		expect(targets).toEqual({
			'teams.owner': USERS_COLLECTION_ID,
			'team_memberships.team': teamsId,
			'team_memberships.user': USERS_COLLECTION_ID,
			'projects.team': teamsId,
			'projects.owner': USERS_COLLECTION_ID
		});
		expect(lintSchema(after).filter((i) => i.level === 'error')).toEqual([]);
	});

	it('leaves an unknown target alone so the lint can report it', () => {
		const after = applyPatternResult(builtinSchema(), {
			collections: [
				{
					name: 'a',
					type: 'base',
					fields: [{ name: 'b', type: 'relation', collectionId: 'nowhere' }]
				}
			]
		});
		expect(resolveTarget(after, 'nowhere')).toBe('nowhere');
		expect(lintSchema(after).map((i) => i.code)).toEqual(['relation-missing-target']);
	});

	it('applies add, rename and remove patches to an existing collection', () => {
		const base = applyPatternResult(builtinSchema(), teamsResult);
		const after = applyPatternResult(base, {
			collectionPatches: [
				{
					collectionName: 'users',
					changes: [
						{ op: 'add', field: { name: 'birthday', type: 'date' } },
						{ op: 'rename', from: 'name', to: 'full_name' },
						{ op: 'remove', fieldName: 'avatar' }
					]
				}
			]
		});
		const ops = diff(base, after)
			.ops.map((op) => op.kind)
			.sort();
		expect(ops).toEqual(['addField', 'dropField', 'renameField']);
	});

	it('throws on a patch for an unknown collection unless told to skip', () => {
		const patch: PatternResult['collectionPatches'] = [
			{ collectionName: 'ghosts', changes: [{ op: 'remove', fieldName: 'x' }] }
		];
		expect(() => applyPatternResult(builtinSchema(), { collectionPatches: patch })).toThrow(
			/ghosts/
		);
		expect(() =>
			applyPatternResult(builtinSchema(), { collectionPatches: patch }, { missing: 'skip' })
		).not.toThrow();
	});

	it('drops collections by name and does not touch the baseline', () => {
		const base = applyPatternResult(builtinSchema(), teamsResult);
		const snapshot = structuredClone(base);
		const after = applyPatternResult(base, {
			collectionDrops: [{ name: 'team_memberships', exists: true, rowCount: 0 }]
		});
		expect(after.collections.map((c) => c.name)).toEqual(['users', 'teams']);
		expect(base).toEqual(snapshot);
	});

	it('skips a create for a collection the baseline already has', () => {
		const base = applyPatternResult(builtinSchema(), teamsResult);
		const after = applyPatternResult(base, teamsResult);
		expect(after).toEqual(base);
	});

	it('produces a plan PocketBase can apply for the payments cycle', () => {
		const payments: PatternResult['collections'] = [
			{
				name: 'stripe_customers',
				type: 'base',
				fields: [
					{ name: 'user', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
					{
						name: 'default_payment_method',
						type: 'relation',
						collectionId: 'stripe_payment_methods',
						maxSelect: 1
					}
				]
			},
			{
				name: 'stripe_payment_methods',
				type: 'base',
				fields: [
					{
						name: 'customer',
						type: 'relation',
						collectionId: 'stripe_customers',
						maxSelect: 1,
						cascadeDelete: true
					}
				]
			}
		];
		const base = builtinSchema();
		const after = applyPatternResult(base, { collections: payments }, { ids: seededIds('t') });
		const { steps } = plan(base, after);
		expect(steps.map((s) => `${s.phase}:${s.kind}:${s.name}`)).toEqual([
			'3:create:stripe_customers',
			'3:create:stripe_payment_methods',
			'4:update:stripe_customers'
		]);
	});
});

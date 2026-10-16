import { describe, expect, it } from 'vitest';
import { diff } from '../diff.js';
import { hasErrors, lint } from '../lint.js';
import { builtinSchema } from '../normalize/builtins.js';
import { plan } from '../plan.js';
import { isRelation } from '../types.js';
import { CATEGORY_LABELS, gallery, galleryBySlug, withUsers } from './index.js';

describe('the gallery', () => {
	it('has unique slugs with a label for every category', () => {
		const slugs = gallery.map((g) => g.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const g of gallery) {
			expect(g.slug).toMatch(/^[a-z][a-z0-9-]+$/);
			expect(CATEGORY_LABELS[g.category]).toBeTruthy();
			expect(galleryBySlug[g.slug]).toBe(g);
			expect(g.summary.length).toBeGreaterThan(20);
			expect(g.description.length).toBeGreaterThan(100);
		}
	});

	for (const entry of gallery) {
		describe(entry.slug, () => {
			it('lints clean against a fresh project and plans without deferrals it cannot make', () => {
				const base = builtinSchema();
				const next = withUsers(entry);
				const changes = diff(base, next);
				const issues = lint(base, next, changes);
				expect(hasErrors(issues), JSON.stringify(issues.filter((i) => i.level === 'error'))).toBe(
					false
				);
				const steps = plan(base, next, changes);
				expect(steps.steps.length).toBeGreaterThanOrEqual(entry.schema.collections.length);
				expect(steps.steps.every((s) => s.kind !== 'delete')).toBe(true);
			});

			it('has deterministic ids and resolved relations', () => {
				const again = galleryBySlug[entry.slug]!;
				expect(again.schema).toEqual(entry.schema);
				const ids = new Set(entry.schema.collections.map((c) => c.id));
				for (const c of entry.schema.collections) {
					expect(c.id).toMatch(/^pbc_\d{10}$/);
					expect(c.fields[0]!.id).toBe('text3208210256');
					for (const f of c.fields) {
						expect(f.id).toMatch(/^[a-zA-Z]+\d+$/);
						if (isRelation(f))
							expect(ids.has(f.collectionId) || f.collectionId === '_pb_users_auth_').toBe(true);
					}
					const names = c.fields.map((f) => f.name);
					expect(new Set(names).size).toBe(names.length);
					expect(names.at(-2)).toBe('created');
					expect(names.at(-1)).toBe('updated');
				}
			});
		});
	}
});

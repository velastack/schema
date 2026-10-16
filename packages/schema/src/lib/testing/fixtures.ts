/**
 * Builders and named schemas shared by the tests. Shapes follow the real
 * collections patterns emit (enable-teams, enable-payments) so the engine is
 * exercised on the graphs it will meet.
 */

import { USERS_COLLECTION_ID } from '../ids.js';
import { usersCollection } from '../normalize/builtins.js';
import type { Collection, Field, RelationField, Rules, Schema } from '../types.js';

export const rules = (rule: string | null = null): Rules => ({
	list: rule,
	view: rule,
	create: rule,
	update: rule,
	delete: rule
});

export const text = (name: string, extra: Partial<Field> = {}): Field =>
	({ id: `text_${name}`, name, type: 'text', ...extra }) as Field;

export const relation = (
	name: string,
	collectionId: string,
	extra: Partial<RelationField> = {}
): RelationField => ({
	id: `relation_${name}`,
	name,
	type: 'relation',
	collectionId,
	maxSelect: 1,
	...extra
});

export const collection = (
	name: string,
	fields: Field[],
	extra: Partial<Collection> = {}
): Collection => ({
	id: `pbc_${name}`,
	name,
	type: 'base',
	fields,
	indexes: [],
	rules: rules(),
	...extra
});

export const schema = (...collections: Collection[]): Schema => ({ collections });

export const USERS = USERS_COLLECTION_ID;

/** `users` plus the enable-teams collections, relations as the pattern defines them. */
export const teamsSchema = (): Schema =>
	schema(
		usersCollection(),
		collection('teams', [text('name'), relation('owner', USERS)]),
		collection('team_memberships', [
			relation('team', 'pbc_teams', { cascadeDelete: true }),
			relation('user', USERS, { cascadeDelete: true })
		]),
		collection('team_invites', [
			text('email'),
			relation('team', 'pbc_teams', { cascadeDelete: true })
		])
	);

/** The enable-payments pair: customers ↔ payment methods, a real cycle. */
export const paymentsSchema = (): Schema =>
	schema(
		usersCollection(),
		collection('stripe_customers', [
			relation('user', USERS),
			relation('default_payment_method', 'pbc_stripe_payment_methods')
		]),
		collection('stripe_payment_methods', [
			text('brand'),
			relation('customer', 'pbc_stripe_customers', { cascadeDelete: true })
		])
	);

/** A tree: categories point at their parent category. */
export const selfRelationSchema = (): Schema =>
	schema(collection('categories', [text('title'), relation('parent', 'pbc_categories')]));

/** authors ← books.author, the shape used to test dropping a referenced collection. */
export const librarySchema = (): Schema =>
	schema(
		collection('authors', [text('name')]),
		collection('books', [text('title'), relation('author', 'pbc_authors')])
	);

export const byName = (s: Schema, name: string): Collection => {
	const found = s.collections.find((c) => c.name === name);
	if (!found) throw new Error(`no collection ${name}`);
	return found;
};

export const clone = <T>(value: T): T => structuredClone(value);

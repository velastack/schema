/**
 * Collections PocketBase creates itself, for use as a baseline when the real
 * database is not available (pattern previews, gallery schemas, tests).
 *
 * `users` is the one that matters: patterns relate to it constantly and never
 * emit it. The field list is PocketBase 0.23+'s default auth collection.
 */

import { USERS_COLLECTION_ID } from '../ids.js';
import type { Collection, Field, Schema } from '../types.js';

/** The `id` field PocketBase adds to every base collection. */
export const systemIdField = (): Field => ({
	id: 'text3208210256',
	name: 'id',
	type: 'text',
	system: true,
	required: true,
	primaryKey: true,
	min: 15,
	max: 15,
	pattern: '^[a-z0-9]+$',
	autogeneratePattern: '[a-z0-9]{15}'
});

export const usersCollection = (): Collection => ({
	id: USERS_COLLECTION_ID,
	name: 'users',
	type: 'auth',
	fields: [
		systemIdField(),
		{
			id: 'password901924565',
			name: 'password',
			type: 'password',
			system: true,
			hidden: true,
			required: true,
			min: 8
		},
		{
			id: 'text2504183744',
			name: 'tokenKey',
			type: 'text',
			system: true,
			hidden: true,
			required: true,
			min: 30,
			max: 60,
			autogeneratePattern: '[a-zA-Z0-9]{50}'
		},
		{ id: 'email3885137012', name: 'email', type: 'email', system: true, required: true },
		{ id: 'bool1547992806', name: 'emailVisibility', type: 'bool', system: true },
		{ id: 'bool256245529', name: 'verified', type: 'bool', system: true },
		{ id: 'text1579384326', name: 'name', type: 'text', max: 255 },
		{
			id: 'file376926767',
			name: 'avatar',
			type: 'file',
			maxSelect: 1,
			maxSize: 0,
			mimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp']
		},
		{ id: 'autodate2990389176', name: 'created', type: 'autodate', onCreate: true },
		{ id: 'autodate3332085495', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
	],
	indexes: [
		'CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)',
		"CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''"
	],
	rules: {
		list: 'id = @request.auth.id',
		view: 'id = @request.auth.id',
		create: '',
		update: 'id = @request.auth.id',
		delete: 'id = @request.auth.id'
	}
});

/** The system fields PocketBase adds to an auth collection, with its fixed ids. */
export const authSystemFields = (): Field[] => [
	systemIdField(),
	{
		id: 'password901924565',
		name: 'password',
		type: 'password',
		system: true,
		hidden: true,
		required: true,
		min: 8
	},
	{
		id: 'text2504183744',
		name: 'tokenKey',
		type: 'text',
		system: true,
		hidden: true,
		required: true,
		min: 30,
		max: 60,
		autogeneratePattern: '[a-zA-Z0-9]{50}'
	},
	{ id: 'email3885137012', name: 'email', type: 'email', system: true, required: true },
	{ id: 'bool1547992806', name: 'emailVisibility', type: 'bool', system: true },
	{ id: 'bool256245529', name: 'verified', type: 'bool', system: true }
];

/**
 * The collection with the system fields PocketBase will add on save, so a
 * schema built by hand diffs cleanly against the database afterwards. Fields
 * already present (by name) are kept as they are. Views get nothing: their
 * fields come from the query.
 */
export const completeCollection = (collection: Collection): Collection => {
	if (collection.type === 'view') return collection;
	const required = collection.type === 'auth' ? authSystemFields() : [systemIdField()];
	const present = new Set(collection.fields.map((f) => f.name));
	const missing = required.filter((f) => !present.has(f.name));
	// PocketBase also gives every auth collection two unique indexes.
	const indexes =
		collection.type === 'auth'
			? [
					...authSystemIndexes(collection).filter(
						(index) => !collection.indexes.some((own) => sameIndexColumns(own, index))
					),
					...collection.indexes
				]
			: collection.indexes;
	if (missing.length === 0 && indexes.length === collection.indexes.length) return collection;
	return { ...collection, fields: [...missing, ...collection.fields], indexes };
};

/** The unique indexes PocketBase creates on an auth collection, named after its id. */
export const authSystemIndexes = (collection: Pick<Collection, 'id' | 'name'>): string[] => [
	`CREATE UNIQUE INDEX \`idx_tokenKey_${collection.id}\` ON \`${collection.name}\` (\`tokenKey\`)`,
	`CREATE UNIQUE INDEX \`idx_email_${collection.id}\` ON \`${collection.name}\` (\`email\`) WHERE \`email\` != ''`
];

/** Whether two index statements cover the same column list, whatever their names. */
const sameIndexColumns = (a: string, b: string): boolean => {
	const columns = (sql: string) => /\(([^)]*)\)/.exec(sql)?.[1]?.replace(/[`\s]/g, '') ?? sql;
	return columns(a) === columns(b);
};

export const completeSchema = (schema: Schema): Schema => ({
	collections: schema.collections.map(completeCollection)
});

/** A fresh PocketBase database as the editor sees it: `users` and nothing else. */
export const builtinSchema = (): Schema => ({ collections: [usersCollection()] });

/**
 * Builders for the gallery's schemas. A gallery schema is written as code
 * so ids are deterministic (the same slug gives the same ids on every
 * build) and a relation can name its target rather than carry an id.
 */

import { pocketbaseFieldId, seededIds, USERS_COLLECTION_ID } from '../ids.js';
import { usersCollection } from '../normalize/builtins.js';
import type { Collection, Field, FieldType, Rules, Schema } from '../types.js';

export type GallerySchemaCategory =
	'commerce' | 'bookings' | 'operations' | 'content' | 'community' | 'finance';

export interface GallerySchema {
	slug: string;
	title: string;
	/** One sentence for cards and metadata. */
	summary: string;
	/** A paragraph or two for the detail page; plain text. */
	description: string;
	category: GallerySchemaCategory;
	tags: string[];
	/** The collections, `users` excluded; relations to `users` are allowed. */
	schema: Schema;
}

/** A field as written in a gallery schema: options only, the id is derived. */
type Spec<F> = F extends Field ? Omit<F, 'id'> : never;
type FieldSpec = Spec<Field>;

const SYSTEM_ID: Field = {
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
};

/** The rule shape every gallery collection starts from: signed-in users only. */
export const SIGNED_IN: Rules = {
	list: '@request.auth.id != ""',
	view: '@request.auth.id != ""',
	create: '@request.auth.id != ""',
	update: '@request.auth.id != ""',
	delete: '@request.auth.id != ""'
};

/** Rules scoping records to the user named in `field`. */
export const OWNED_BY = (field: string): Rules => ({
	list: `@request.auth.id != "" && ${field} = @request.auth.id`,
	view: `@request.auth.id != "" && ${field} = @request.auth.id`,
	create: `@request.auth.id != "" && @request.body.${field} = @request.auth.id`,
	update: `@request.auth.id != "" && ${field} = @request.auth.id`,
	delete: `@request.auth.id != "" && ${field} = @request.auth.id`
});

// Field shorthands. Each is a plain FieldSpec, so a schema reads as a table.
export const text = (
	name: string,
	o: Partial<Extract<Field, { type: 'text' }>> = {}
): FieldSpec => ({ name, type: 'text', ...o });
export const editor = (
	name: string,
	o: Partial<Extract<Field, { type: 'editor' }>> = {}
): FieldSpec => ({ name, type: 'editor', ...o });
export const number = (
	name: string,
	o: Partial<Extract<Field, { type: 'number' }>> = {}
): FieldSpec => ({ name, type: 'number', ...o });
export const bool = (
	name: string,
	o: Partial<Extract<Field, { type: 'bool' }>> = {}
): FieldSpec => ({ name, type: 'bool', ...o });
export const email = (
	name: string,
	o: Partial<Extract<Field, { type: 'email' }>> = {}
): FieldSpec => ({ name, type: 'email', ...o });
export const url = (name: string, o: Partial<Extract<Field, { type: 'url' }>> = {}): FieldSpec => ({
	name,
	type: 'url',
	...o
});
export const date = (
	name: string,
	o: Partial<Extract<Field, { type: 'date' }>> = {}
): FieldSpec => ({ name, type: 'date', ...o });
export const json = (
	name: string,
	o: Partial<Extract<Field, { type: 'json' }>> = {}
): FieldSpec => ({ name, type: 'json', ...o });
export const geo = (name: string): FieldSpec => ({ name, type: 'geoPoint' });
export const select = (
	name: string,
	values: string[],
	o: Partial<Extract<Field, { type: 'select' }>> = {}
): FieldSpec => ({
	name,
	type: 'select',
	values,
	maxSelect: 1,
	...o
});
export const file = (
	name: string,
	o: Partial<Extract<Field, { type: 'file' }>> = {}
): FieldSpec => ({ name, type: 'file', maxSelect: 1, ...o });
export const files = (
	name: string,
	o: Partial<Extract<Field, { type: 'file' }>> = {}
): FieldSpec => ({ name, type: 'file', maxSelect: 99, ...o });
/** A relation; `target` is a collection name in the same schema, or `users`. */
export const relation = (
	name: string,
	target: string,
	o: Partial<Extract<Field, { type: 'relation' }>> = {}
): FieldSpec => ({
	name,
	type: 'relation',
	collectionId: target,
	maxSelect: 1,
	cascadeDelete: false,
	...o
});
export const relations = (
	name: string,
	target: string,
	o: Partial<Extract<Field, { type: 'relation' }>> = {}
): FieldSpec => relation(name, target, { maxSelect: 999, ...o });
export const created = (): FieldSpec => ({ name: 'created', type: 'autodate', onCreate: true });
export const updated = (): FieldSpec => ({
	name: 'updated',
	type: 'autodate',
	onCreate: true,
	onUpdate: true
});

export interface CollectionSpec {
	name: string;
	fields: FieldSpec[];
	rules?: Rules;
	indexes?: string[];
}

/** A collection: the system id first, created/updated last, signed-in rules unless given. */
export const collection = (
	name: string,
	fields: FieldSpec[],
	extra: Omit<CollectionSpec, 'name' | 'fields'> = {}
): CollectionSpec => ({
	name,
	fields: [...fields, created(), updated()],
	rules: extra.rules ?? SIGNED_IN,
	...(extra.indexes ? { indexes: extra.indexes } : {})
});

/** Unique index on one or more columns, named the way PocketBase names them. */
export const unique = (table: string, ...columns: string[]): string =>
	`CREATE UNIQUE INDEX \`idx_${table}_${columns.join('_')}\` ON \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')})`;
export const index = (table: string, ...columns: string[]): string =>
	`CREATE INDEX \`idx_${table}_${columns.join('_')}\` ON \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')})`;

/**
 * Resolve a gallery schema: deterministic collection ids from the slug,
 * PocketBase-style field ids, relation targets by name.
 */
export const define = (
	meta: Omit<GallerySchema, 'schema'>,
	specs: CollectionSpec[]
): GallerySchema => {
	const ids = seededIds(`gallery:${meta.slug}`);
	const byName = new Map<string, string>([['users', USERS_COLLECTION_ID]]);
	for (const spec of specs) byName.set(spec.name, ids.collection(spec.name));

	const collections: Collection[] = specs.map((spec) => ({
		id: byName.get(spec.name)!,
		name: spec.name,
		type: 'base',
		indexes: spec.indexes ?? [],
		rules: spec.rules ?? SIGNED_IN,
		fields: [
			SYSTEM_ID,
			...spec.fields.map((f) => {
				const field = { ...f, id: pocketbaseFieldId(f.type as FieldType, f.name) } as Field;
				if (field.type === 'relation') {
					const target = byName.get(field.collectionId);
					if (!target)
						throw new Error(
							`${meta.slug}: ${spec.name}.${f.name} points at unknown collection "${field.collectionId}"`
						);
					field.collectionId = target;
				}
				return field;
			})
		]
	}));

	return { ...meta, schema: { collections } };
};

/** The schema with PocketBase's `users` in front, as a fresh project would hold it. */
export const withUsers = (gallery: GallerySchema): Schema => ({
	collections: [usersCollection(), ...gallery.schema.collections]
});

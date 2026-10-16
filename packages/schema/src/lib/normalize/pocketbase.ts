/**
 * To and from PocketBase's collection JSON, as returned by
 * `GET /api/collections` (the JS SDK's `CollectionModel`) and accepted by the
 * create and update endpoints.
 */

import {
	FIELD_TYPES,
	type Collection,
	type CollectionType,
	type Field,
	type FieldType,
	type Rules,
	type Schema
} from '../types.js';

/** The loose shape PocketBase returns; the SDK types it as `[key: string]: any`. */
export interface PocketBaseField {
	id: string;
	name: string;
	type: string;
	[key: string]: unknown;
}

export interface PocketBaseCollection {
	id: string;
	name: string;
	type: string;
	system?: boolean;
	fields: PocketBaseField[];
	indexes?: string[];
	listRule?: string | null;
	viewRule?: string | null;
	createRule?: string | null;
	updateRule?: string | null;
	deleteRule?: string | null;
	viewQuery?: string;
	[key: string]: unknown;
}

const COLLECTION_KEYS = new Set([
	'id',
	'name',
	'type',
	'system',
	'fields',
	'indexes',
	'listRule',
	'viewRule',
	'createRule',
	'updateRule',
	'deleteRule',
	'viewQuery',
	// Bookkeeping PocketBase adds on read; never sent back.
	'created',
	'updated',
	'collectionId',
	'collectionName'
]);

const isFieldType = (type: string): type is FieldType => (FIELD_TYPES as string[]).includes(type);

export const fieldFromPocketBase = (raw: PocketBaseField): Field => {
	if (!isFieldType(raw.type)) {
		throw new Error(`Unknown PocketBase field type "${raw.type}" on field "${raw.name}"`);
	}
	// PocketBase serialises every option with its zero value; the canonical
	// model keeps them as given so a round trip is exact.
	return { ...raw, type: raw.type } as Field;
};

export const collectionFromPocketBase = (raw: PocketBaseCollection): Collection => {
	const rules: Rules = {
		list: raw.listRule ?? null,
		view: raw.viewRule ?? null,
		create: raw.createRule ?? null,
		update: raw.updateRule ?? null,
		delete: raw.deleteRule ?? null
	};
	const extra: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!COLLECTION_KEYS.has(key)) extra[key] = value;
	}
	const collection: Collection = {
		id: raw.id,
		name: raw.name,
		type: raw.type as CollectionType,
		fields: raw.fields.map(fieldFromPocketBase),
		indexes: raw.indexes ?? [],
		rules
	};
	if (raw.system) collection.system = true;
	if (raw.type === 'view' && typeof raw.viewQuery === 'string') {
		collection.viewQuery = raw.viewQuery;
	}
	if (Object.keys(extra).length > 0) collection.extra = extra;
	return collection;
};

export const schemaFromPocketBase = (collections: PocketBaseCollection[]): Schema => ({
	collections: collections.map(collectionFromPocketBase)
});

/** The body for `POST /api/collections` or `PATCH /api/collections/:id`. */
export const collectionToPocketBase = (collection: Collection): PocketBaseCollection => {
	const body: PocketBaseCollection = {
		...(collection.extra ?? {}),
		id: collection.id,
		name: collection.name,
		type: collection.type,
		system: collection.system ?? false,
		fields: collection.fields.map((field) => ({ ...field })),
		indexes: collection.indexes,
		listRule: collection.rules.list,
		viewRule: collection.rules.view,
		createRule: collection.rules.create,
		updateRule: collection.rules.update,
		deleteRule: collection.rules.delete
	};
	if (collection.type === 'view') body.viewQuery = collection.viewQuery ?? '';
	return body;
};

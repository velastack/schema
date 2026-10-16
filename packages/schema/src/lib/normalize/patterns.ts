/**
 * From a pattern's `generate()` result (@velastack/patterns) to a schema.
 *
 * Patterns return PocketBase collection JSON without ids: new collections as
 * `collections`, changes to existing ones as `collectionPatches`, removals as
 * `collectionDrops`. Applying them to a baseline gives the schema after the
 * pattern ran; `diff(baseline, after)` is then what the pattern changes, which
 * is what a pattern page draws.
 *
 * The types below mirror @velastack/patterns `src/core/types.ts`. They are
 * copied rather than imported so the engine has no dependency on the registry.
 */

import { seededIds, USERS_COLLECTION_ID, type IdMinter } from '../ids.js';
import { type Collection, type Field, type FieldType, type Schema, isRelation } from '../types.js';
import { systemIdField } from './builtins.js';

export interface PatternFieldSpec {
	name: string;
	type: string;
	required?: boolean;
	/** A collection id, a collection name, or a preview id such as `users_preview`. */
	collectionId?: string;
	maxSelect?: number;
	minSelect?: number;
	values?: string[];
	onCreate?: boolean;
	onUpdate?: boolean;
	primaryKey?: boolean;
	cascadeDelete?: boolean;
	pattern?: string;
	min?: number;
	max?: number;
	autogeneratePattern?: string;
	exceptDomains?: null;
	onlyDomains?: null;
}

export interface PatternCollectionSpec {
	name: string;
	type: 'base' | 'auth' | 'view';
	listRule?: string | null;
	viewRule?: string | null;
	createRule?: string | null;
	updateRule?: string | null;
	deleteRule?: string | null;
	fields: PatternFieldSpec[];
	viewQuery?: string;
	indexes?: string[];
}

export type PatternFieldChange =
	| { op: 'add'; field: PatternFieldSpec }
	| { op: 'remove'; fieldName: string }
	| { op: 'rename'; from: string; to: string };

export interface PatternFieldsPatch {
	collectionName: string;
	changes: PatternFieldChange[];
}

export interface PatternCollectionDrop {
	name: string;
	exists: boolean;
	rowCount: number;
}

export interface PatternResult {
	collections: PatternCollectionSpec[];
	collectionPatches: PatternFieldsPatch[];
	collectionDrops: PatternCollectionDrop[];
}

export interface ApplyPatternOptions {
	/** Defaults to deterministic ids seeded by the collection name. */
	ids?: IdMinter;
	/**
	 * What to do with a patch for a collection the baseline does not have.
	 * `'throw'` (default) matches what the CLI would do; `'skip'` is for
	 * previews that only want to draw what they can.
	 */
	missing?: 'throw' | 'skip';
}

const PREVIEW_SUFFIX = '_preview';

/**
 * Resolve a relation target to an id in `schema`. Patterns point at
 * collections by real id (`_pb_users_auth_`), by name (`teams`) or by preview
 * id (`users_preview`). Returns the input unchanged when nothing matches so
 * the lint can report it.
 */
export const resolveTarget = (schema: Schema, target: string): string => {
	const byId = schema.collections.find((c) => c.id === target);
	if (byId) return byId.id;
	const byName = schema.collections.find((c) => c.name === target);
	if (byName) return byName.id;
	if (target.endsWith(PREVIEW_SUFFIX)) {
		const name = target.slice(0, -PREVIEW_SUFFIX.length);
		const previewed = schema.collections.find((c) => c.name === name);
		if (previewed) return previewed.id;
		if (name === 'users') return USERS_COLLECTION_ID;
	}
	return target;
};

const fieldFromSpec = (spec: PatternFieldSpec, ids: IdMinter): Field => {
	const { name, type, ...options } = spec;
	return {
		...options,
		id: ids.field(type as FieldType, name),
		name,
		type
	} as Field;
};

export const collectionFromSpec = (spec: PatternCollectionSpec, ids: IdMinter): Collection => {
	const fields = spec.fields.map((field) => fieldFromSpec(field, ids));
	// PocketBase adds `id` to every base collection; show it so the diagram
	// matches what the database will have.
	if (spec.type === 'base' && !fields.some((f) => f.name === 'id')) {
		fields.unshift(systemIdField());
	}
	const collection: Collection = {
		id: ids.collection(spec.name),
		name: spec.name,
		type: spec.type,
		fields,
		indexes: spec.indexes ?? [],
		rules: {
			list: spec.listRule ?? null,
			view: spec.viewRule ?? null,
			create: spec.createRule ?? null,
			update: spec.updateRule ?? null,
			delete: spec.deleteRule ?? null
		}
	};
	if (spec.type === 'view') collection.viewQuery = spec.viewQuery ?? '';
	return collection;
};

const cloneSchema = (schema: Schema): Schema => structuredClone(schema);

/**
 * The schema after `result` is applied to `baseline`. The baseline is not
 * modified. Creates of collections the baseline already has are skipped, the
 * way the runtime treats "already exists" as success.
 */
export const applyPatternResult = (
	baseline: Schema,
	result: Partial<PatternResult>,
	options: ApplyPatternOptions = {}
): Schema => {
	const ids = options.ids ?? seededIds('pattern');
	const missing = options.missing ?? 'throw';
	const schema = cloneSchema(baseline);

	for (const spec of result.collections ?? []) {
		if (schema.collections.some((c) => c.name === spec.name)) continue;
		schema.collections.push(collectionFromSpec(spec, ids));
	}

	for (const patch of result.collectionPatches ?? []) {
		const collection = schema.collections.find((c) => c.name === patch.collectionName);
		if (!collection) {
			if (missing === 'skip') continue;
			throw new Error(`Patch targets unknown collection "${patch.collectionName}"`);
		}
		for (const change of patch.changes) {
			switch (change.op) {
				case 'add':
					collection.fields.push(fieldFromSpec(change.field, ids));
					break;
				case 'remove':
					collection.fields = collection.fields.filter((f) => f.name !== change.fieldName);
					break;
				case 'rename': {
					const field = collection.fields.find((f) => f.name === change.from);
					if (field) field.name = change.to;
					break;
				}
			}
		}
	}

	for (const drop of result.collectionDrops ?? []) {
		schema.collections = schema.collections.filter((c) => c.name !== drop.name);
	}

	// Targets can only be resolved once every collection in the result exists.
	for (const collection of schema.collections) {
		for (const field of collection.fields) {
			if (isRelation(field)) field.collectionId = resolveTarget(schema, field.collectionId);
		}
	}

	return schema;
};

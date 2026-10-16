/**
 * The id-based diff.
 *
 * Two schemas in, a list of typed operations out. Collections and fields are
 * matched by id only: a kept id with a different name is a rename, an id
 * missing from `next` is a drop, an id new in `next` is an add. PocketBase
 * applies the same rule when it syncs a collection to its table, so there is
 * nothing to guess.
 *
 * Two changes PocketBase refuses in place become a drop plus an add with a
 * fresh id: a field's type and a relation's target. Both lose data and are
 * emitted as `replaceField` so the lint and the review UI can say so.
 */

import { seededIds, type IdMinter } from './ids.js';
import { isRelation, type Collection, type Field, type Rules, type Schema } from './types.js';

export type Op =
	| { kind: 'createCollection'; collection: Collection }
	| { kind: 'dropCollection'; collectionId: string; name: string; collection: Collection }
	| { kind: 'renameCollection'; collectionId: string; from: string; to: string }
	| { kind: 'updateRules'; collectionId: string; from: Rules; to: Rules }
	| { kind: 'updateIndexes'; collectionId: string; added: string[]; removed: string[] }
	| { kind: 'updateViewQuery'; collectionId: string; from: string; to: string }
	| { kind: 'addField'; collectionId: string; field: Field; position: number }
	| { kind: 'dropField'; collectionId: string; fieldId: string; name: string; field: Field }
	| { kind: 'renameField'; collectionId: string; fieldId: string; from: string; to: string }
	| {
			kind: 'updateField';
			collectionId: string;
			fieldId: string;
			name: string;
			/** Option names whose value changed. */
			changed: string[];
			from: Field;
			to: Field;
	  }
	| {
			kind: 'replaceField';
			collectionId: string;
			/** The field being dropped. */
			fieldId: string;
			name: string;
			reason: 'type' | 'target';
			from: Field;
			/** The replacement, with a new id. */
			to: Field;
	  };

export interface ChangeSet {
	ops: Op[];
}

export interface DiffOptions {
	/** Mints ids for `replaceField`; deterministic by default. */
	ids?: IdMinter;
}

const isZero = (value: unknown): boolean =>
	value === undefined ||
	value === null ||
	value === 0 ||
	value === false ||
	value === '' ||
	(Array.isArray(value) && value.length === 0);

/** Options PocketBase stores as nullable pointers, where `0` is a real bound and `null` is none. */
const NULLABLE_NUMBER_OPTIONS = new Set(['min', 'max']);

/**
 * Options with PocketBase's zero values removed, so `min: 0` equals no `min`
 * on a text field. A number field's `min`/`max` keep `0`: there it means
 * "non-negative", while `null` means unbounded.
 */
const canonicalOptions = (field: Field): Record<string, unknown> => {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(field)) {
		if (key === 'id' || key === 'name' || key === 'type') continue;
		const keepZero = field.type === 'number' && NULLABLE_NUMBER_OPTIONS.has(key) && value === 0;
		if (!keepZero && isZero(value)) continue;
		out[key] = value;
	}
	return out;
};

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const changedOptions = (from: Field, to: Field): string[] => {
	const a = canonicalOptions(from);
	const b = canonicalOptions(to);
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	return [...keys].filter((key) => !sameValue(a[key], b[key])).sort();
};

const sameRules = (a: Rules, b: Rules): boolean =>
	a.list === b.list &&
	a.view === b.view &&
	a.create === b.create &&
	a.update === b.update &&
	a.delete === b.delete;

const diffFields = (base: Collection, next: Collection, ids: IdMinter): Op[] => {
	const ops: Op[] = [];
	const baseById = new Map(base.fields.map((f) => [f.id, f]));
	const nextById = new Map(next.fields.map((f) => [f.id, f]));

	for (const field of base.fields) {
		if (!nextById.has(field.id)) {
			ops.push({
				kind: 'dropField',
				collectionId: base.id,
				fieldId: field.id,
				name: field.name,
				field
			});
		}
	}

	next.fields.forEach((field, position) => {
		const before = baseById.get(field.id);
		if (!before) {
			ops.push({ kind: 'addField', collectionId: base.id, field, position });
			return;
		}
		const retyped = before.type !== field.type;
		const retargeted =
			isRelation(before) && isRelation(field) && before.collectionId !== field.collectionId;
		if (retyped || retargeted) {
			ops.push({
				kind: 'replaceField',
				collectionId: base.id,
				fieldId: before.id,
				name: before.name,
				reason: retyped ? 'type' : 'target',
				from: before,
				// A new type gives a new PocketBase-style id by itself; a new target
				// keeps type and name, so the target goes into the hint.
				to: {
					...field,
					id: ids.field(
						field.type,
						retyped
							? field.name
							: `${field.name}:${(field as { collectionId: string }).collectionId}`
					)
				}
			});
			return;
		}
		if (before.name !== field.name) {
			ops.push({
				kind: 'renameField',
				collectionId: base.id,
				fieldId: field.id,
				from: before.name,
				to: field.name
			});
		}
		const changed = changedOptions(before, field);
		if (changed.length > 0) {
			ops.push({
				kind: 'updateField',
				collectionId: base.id,
				fieldId: field.id,
				name: field.name,
				changed,
				from: before,
				to: field
			});
		}
	});

	return ops;
};

const diffCollection = (base: Collection, next: Collection, ids: IdMinter): Op[] => {
	// A collection's type is fixed for life; the only way through is a new one.
	if (base.type !== next.type) {
		return [
			{ kind: 'dropCollection', collectionId: base.id, name: base.name, collection: base },
			{ kind: 'createCollection', collection: next }
		];
	}
	const ops: Op[] = [];
	if (base.name !== next.name) {
		ops.push({ kind: 'renameCollection', collectionId: base.id, from: base.name, to: next.name });
	}
	if (!sameRules(base.rules, next.rules)) {
		ops.push({ kind: 'updateRules', collectionId: base.id, from: base.rules, to: next.rules });
	}
	const baseIndexes = new Set(base.indexes);
	const nextIndexes = new Set(next.indexes);
	const added = next.indexes.filter((i) => !baseIndexes.has(i));
	const removed = base.indexes.filter((i) => !nextIndexes.has(i));
	if (added.length > 0 || removed.length > 0) {
		ops.push({ kind: 'updateIndexes', collectionId: base.id, added, removed });
	}
	if ((base.viewQuery ?? '') !== (next.viewQuery ?? '')) {
		ops.push({
			kind: 'updateViewQuery',
			collectionId: base.id,
			from: base.viewQuery ?? '',
			to: next.viewQuery ?? ''
		});
	}
	// A view's fields come from its query; PocketBase derives them on save.
	if (base.type !== 'view') ops.push(...diffFields(base, next, ids));
	return ops;
};

export const diff = (base: Schema, next: Schema, options: DiffOptions = {}): ChangeSet => {
	const ids = options.ids ?? seededIds('diff');
	const ops: Op[] = [];
	const nextById = new Map(next.collections.map((c) => [c.id, c]));
	const baseById = new Map(base.collections.map((c) => [c.id, c]));

	for (const collection of base.collections) {
		if (!nextById.has(collection.id)) {
			ops.push({
				kind: 'dropCollection',
				collectionId: collection.id,
				name: collection.name,
				collection
			});
		}
	}
	for (const collection of next.collections) {
		const before = baseById.get(collection.id);
		if (!before) {
			ops.push({ kind: 'createCollection', collection });
		} else {
			ops.push(...diffCollection(before, collection, ids));
		}
	}
	return { ops };
};

export const isEmpty = (changeSet: ChangeSet): boolean => changeSet.ops.length === 0;

/** Ops that lose data: drops, and replacements that drop a column. */
export const destructiveOps = (changeSet: ChangeSet): Op[] =>
	changeSet.ops.filter(
		(op) => op.kind === 'dropCollection' || op.kind === 'dropField' || op.kind === 'replaceField'
	);

export interface ChangeSummary {
	created: number;
	dropped: number;
	changed: number;
	destructive: number;
	total: number;
}

export const summarize = (changeSet: ChangeSet): ChangeSummary => {
	const changed = new Set<string>();
	let created = 0;
	let dropped = 0;
	for (const op of changeSet.ops) {
		if (op.kind === 'createCollection') created++;
		else if (op.kind === 'dropCollection') dropped++;
		else changed.add(op.collectionId);
	}
	return {
		created,
		dropped,
		changed: changed.size,
		destructive: destructiveOps(changeSet).length,
		total: changeSet.ops.length
	};
};

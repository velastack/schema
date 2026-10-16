/**
 * From a base schema, a next schema and their change set to what a diagram
 * draws: collections and fields with a status (created, dropped, changed,
 * renamed...) plus the relation edges between them. The UI package renders
 * this and nothing else, so the same model drives a plain schema (every
 * status `unchanged`), a pattern page (only what changed plus its
 * neighbours) and the editor's review of a proposed change.
 */

import { diff, type ChangeSet } from './diff.js';
import {
	isMultiple,
	isRelation,
	type Collection,
	type Field,
	type FieldType,
	type Schema
} from './types.js';

export type CollectionStatus = 'created' | 'dropped' | 'changed' | 'unchanged';
export type FieldStatus = 'added' | 'removed' | 'renamed' | 'changed' | 'replaced' | 'unchanged';
export type EdgeStatus = 'added' | 'removed' | 'unchanged';

export interface DiagramField {
	field: Field;
	status: FieldStatus;
	previousName?: string;
	previousType?: FieldType;
}

export interface DiagramCollection {
	collection: Collection;
	status: CollectionStatus;
	previousName?: string;
	/** Fields in display order, removed ones included where they were. */
	fields: DiagramField[];
	/** System or plugin-owned: drawn but never editable. */
	locked: boolean;
}

export interface DiagramEdge {
	from: string;
	fieldId: string;
	to: string;
	status: EdgeStatus;
	multiple: boolean;
	cascade: boolean;
}

export interface Diagram {
	collections: DiagramCollection[];
	edges: DiagramEdge[];
	/** Collection names by id across base and next, so relation rows can name targets that are not drawn. */
	names: Record<string, string>;
}

export interface AnnotateOptions {
	/**
	 * `'all'` draws every collection. `'changes'` draws only collections with
	 * a change plus the collections they relate to, for showing what a
	 * pattern does.
	 */
	focus?: 'all' | 'changes';
}

/** PocketBase's own collections and plugin collections start with an underscore. */
export const isLocked = (collection: Collection): boolean =>
	Boolean(collection.system) || collection.name.startsWith('_');

const fieldsOf = (
	base: Collection | undefined,
	next: Collection | undefined,
	changeSet: ChangeSet
): DiagramField[] => {
	if (!next) {
		return (base?.fields ?? []).map((field) => ({ field, status: 'removed' }));
	}
	if (!base) {
		return next.fields.map((field) => ({ field, status: 'added' }));
	}
	const ops = changeSet.ops.filter((op) => 'collectionId' in op && op.collectionId === next.id);
	const out: DiagramField[] = [];
	const nextIds = new Set(next.fields.map((f) => f.id));

	// Removed fields keep their old slot: insert each before the first
	// surviving field that followed it in the base order.
	const removedAfter = new Map<string | null, Field[]>();
	let anchor: string | null = null;
	for (const field of base.fields) {
		if (nextIds.has(field.id)) {
			anchor = field.id;
		} else {
			const key = anchor;
			if (!removedAfter.has(key)) removedAfter.set(key, []);
			removedAfter.get(key)!.push(field);
		}
	}
	const pushRemoved = (key: string | null) => {
		for (const field of removedAfter.get(key) ?? []) {
			const replaced = ops.find((op) => op.kind === 'replaceField' && op.fieldId === field.id);
			if (replaced) continue; // drawn as the replacement
			out.push({ field, status: 'removed' });
		}
	};
	pushRemoved(null);

	for (const field of next.fields) {
		const before = base.fields.find((f) => f.id === field.id);
		if (!before) {
			const replacement = ops.find((op) => op.kind === 'replaceField' && op.to.id === field.id);
			if (replacement && replacement.kind === 'replaceField') {
				out.push({ field, status: 'replaced', previousType: replacement.from.type });
			} else {
				out.push({ field, status: 'added' });
			}
			continue;
		}
		// The caller may pass `next` before or after `materialize`: the retyped
		// field then carries either the old id or the minted one.
		const replaced = ops.find((op) => op.kind === 'replaceField' && op.fieldId === field.id);
		if (replaced && replaced.kind === 'replaceField') {
			out.push({ field: replaced.to, status: 'replaced', previousType: replaced.from.type });
			pushRemoved(field.id);
			continue;
		}
		const renamed = ops.find((op) => op.kind === 'renameField' && op.fieldId === field.id);
		const changed = ops.find((op) => op.kind === 'updateField' && op.fieldId === field.id);
		if (renamed && renamed.kind === 'renameField') {
			out.push({ field, status: 'renamed', previousName: renamed.from });
		} else if (changed) {
			out.push({ field, status: 'changed' });
		} else {
			out.push({ field, status: 'unchanged' });
		}
		pushRemoved(field.id);
	}
	return out;
};

export const annotate = (
	base: Schema,
	next: Schema,
	changeSet: ChangeSet = diff(base, next),
	options: AnnotateOptions = {}
): Diagram => {
	const focus = options.focus ?? 'all';
	const baseById = new Map(base.collections.map((c) => [c.id, c]));
	const nextById = new Map(next.collections.map((c) => [c.id, c]));
	const touched = new Set<string>();
	for (const op of changeSet.ops) {
		touched.add('collectionId' in op ? op.collectionId : op.collection.id);
	}

	const all: DiagramCollection[] = [];
	for (const collection of next.collections) {
		const before = baseById.get(collection.id);
		const fields = fieldsOf(before, collection, changeSet);
		const status: CollectionStatus = !before
			? 'created'
			: touched.has(collection.id)
				? 'changed'
				: 'unchanged';
		const entry: DiagramCollection = {
			collection,
			status,
			fields,
			locked: isLocked(collection)
		};
		if (before && before.name !== collection.name) entry.previousName = before.name;
		all.push(entry);
	}
	for (const collection of base.collections) {
		if (nextById.has(collection.id)) continue;
		all.push({
			collection,
			status: 'dropped',
			fields: fieldsOf(collection, undefined, changeSet),
			locked: isLocked(collection)
		});
	}

	let drawn = all;
	if (focus === 'changes') {
		const keep = new Set<string>();
		for (const entry of all) {
			if (entry.status === 'unchanged') continue;
			keep.add(entry.collection.id);
			for (const { field } of entry.fields) {
				if (isRelation(field)) keep.add(field.collectionId);
			}
		}
		drawn = all.filter((entry) => keep.has(entry.collection.id));
	}
	const drawnIds = new Set(drawn.map((entry) => entry.collection.id));

	const edges: DiagramEdge[] = [];
	for (const entry of drawn) {
		for (const { field, status } of entry.fields) {
			if (!isRelation(field) || !drawnIds.has(field.collectionId)) continue;
			const edgeStatus: EdgeStatus =
				entry.status === 'dropped' || status === 'removed'
					? 'removed'
					: entry.status === 'created' || status === 'added' || status === 'replaced'
						? 'added'
						: 'unchanged';
			edges.push({
				from: entry.collection.id,
				fieldId: field.id,
				to: field.collectionId,
				status: edgeStatus,
				multiple: isMultiple(field),
				cascade: Boolean(field.cascadeDelete)
			});
		}
	}

	const names: Record<string, string> = {};
	for (const collection of [...base.collections, ...next.collections]) {
		names[collection.id] = collection.name;
	}

	return { collections: drawn, edges, names };
};

/** A schema drawn as it is: every status `unchanged`. */
export const diagramOf = (schema: Schema): Diagram => annotate(schema, schema, { ops: [] });

/**
 * The drawn collections as a schema, removed fields included, so `layout`
 * sizes each card for what the diagram actually shows.
 */
export const diagramSchema = (diagram: Diagram): Schema => ({
	collections: diagram.collections.map((entry) => ({
		...entry.collection,
		fields: entry.fields.map((f) => f.field)
	}))
});

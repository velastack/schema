/**
 * Lint: everything the editor should say before PocketBase does, plus the
 * things PocketBase never says.
 *
 * `lintSchema` checks a desired state on its own. `lintChangeSet` checks the
 * path from one state to another: what loses data, what is refused. `lint`
 * runs both.
 */

import { type ChangeSet, type Op } from './diff.js';
import { cycles, type Edge } from './graph.js';
import {
	isMultiple,
	isRelation,
	relationEdges,
	type Collection,
	type Field,
	type Schema
} from './types.js';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
	level: IssueLevel;
	code: string;
	message: string;
	collectionId?: string;
	fieldId?: string;
	/** Other collections involved (cycle members, referrers). */
	related?: string[];
}

const NAME_PATTERN = /^\w+$/;
const MAX_NAME = 255;
const RESERVED_FIELD_NAMES = new Set(['expand', 'collectionId', 'collectionName']);

const nameIssue = (name: string): string | null => {
	if (name.length === 0) return 'is empty';
	if (name.length > MAX_NAME) return `is longer than ${MAX_NAME} characters`;
	if (!NAME_PATTERN.test(name)) return 'may only contain letters, digits and underscores';
	if (name.includes('_via_'))
		return 'may not contain "_via_", which PocketBase reserves for back-relations';
	return null;
};

const byId = (schema: Schema) => new Map(schema.collections.map((c) => [c.id, c]));

const label = (collection: Collection, field?: Field): string =>
	field ? `${collection.name}.${field.name}` : collection.name;

export const lintSchema = (schema: Schema): Issue[] => {
	const issues: Issue[] = [];
	const collections = byId(schema);

	// Collection names.
	const seenNames = new Map<string, Collection>();
	for (const collection of schema.collections) {
		const problem = nameIssue(collection.name);
		if (problem) {
			issues.push({
				level: 'error',
				code: 'collection-name',
				message: `Collection name "${collection.name}" ${problem}.`,
				collectionId: collection.id
			});
		}
		const key = collection.name.toLowerCase();
		const other = seenNames.get(key);
		if (other) {
			issues.push({
				level: 'error',
				code: 'collection-name-duplicate',
				message: `Two collections are named "${collection.name}".`,
				collectionId: collection.id,
				related: [other.id]
			});
		} else {
			seenNames.set(key, collection);
		}
		if (collection.type === 'view' && collection.indexes.length > 0) {
			issues.push({
				level: 'error',
				code: 'view-indexes',
				message: `View "${collection.name}" has indexes; PocketBase does not allow indexes on views.`,
				collectionId: collection.id
			});
		}
	}

	// Fields.
	for (const collection of schema.collections) {
		const seenFields = new Map<string, Field>();
		for (const field of collection.fields) {
			const problem = nameIssue(field.name);
			if (problem) {
				issues.push({
					level: 'error',
					code: 'field-name',
					message: `Field name "${label(collection, field)}" ${problem}.`,
					collectionId: collection.id,
					fieldId: field.id
				});
			}
			if (RESERVED_FIELD_NAMES.has(field.name)) {
				issues.push({
					level: 'error',
					code: 'field-name-reserved',
					message: `"${field.name}" is reserved by PocketBase and cannot be a field name.`,
					collectionId: collection.id,
					fieldId: field.id
				});
			}
			const key = field.name.toLowerCase();
			if (seenFields.has(key)) {
				issues.push({
					level: 'error',
					code: 'field-name-duplicate',
					message: `"${collection.name}" has two fields named "${field.name}".`,
					collectionId: collection.id,
					fieldId: field.id
				});
			} else {
				seenFields.set(key, field);
			}

			switch (field.type) {
				case 'select':
					if (!field.values || field.values.length === 0) {
						issues.push({
							level: 'error',
							code: 'select-no-values',
							message: `Select field "${label(collection, field)}" has no options.`,
							collectionId: collection.id,
							fieldId: field.id
						});
					} else if ((field.maxSelect ?? 1) > field.values.length) {
						issues.push({
							level: 'warning',
							code: 'select-max-exceeds-values',
							message: `"${label(collection, field)}" allows ${field.maxSelect} selections but has ${field.values.length} options.`,
							collectionId: collection.id,
							fieldId: field.id
						});
					}
					break;
				case 'autodate':
					if (!field.onCreate && !field.onUpdate) {
						issues.push({
							level: 'error',
							code: 'autodate-no-trigger',
							message: `Autodate field "${label(collection, field)}" is set on neither create nor update.`,
							collectionId: collection.id,
							fieldId: field.id
						});
					}
					break;
				case 'relation': {
					const target = collections.get(field.collectionId);
					if (!target) {
						issues.push({
							level: 'error',
							code: 'relation-missing-target',
							message: `"${label(collection, field)}" relates to a collection that does not exist (${field.collectionId}).`,
							collectionId: collection.id,
							fieldId: field.id
						});
					} else if (target.type === 'view' && collection.type !== 'view') {
						issues.push({
							level: 'error',
							code: 'relation-to-view',
							message: `"${label(collection, field)}" relates to the view "${target.name}"; only views may relate to views.`,
							collectionId: collection.id,
							fieldId: field.id,
							related: [target.id]
						});
					}
					break;
				}
			}
		}
	}

	// Cycles. Every relation edge, then the required-only and cascade-only
	// subgraphs, each of which means something different.
	const ids = schema.collections.map((c) => c.id);
	const edges = relationEdges(schema).filter((e) => collections.has(e.targetId));
	const asEdges = (list: typeof edges): Edge[] =>
		list.map((e) => ({ from: e.collectionId, to: e.targetId }));
	const names = (members: string[]) =>
		members.map((id) => collections.get(id)?.name ?? id).join(', ');

	for (const edge of edges) {
		if (edge.collectionId === edge.targetId) {
			const collection = collections.get(edge.collectionId)!;
			issues.push({
				level: 'info',
				code: 'relation-self',
				message: `"${label(collection, edge.field)}" relates to its own collection; it is added in a second migration step.`,
				collectionId: collection.id,
				fieldId: edge.fieldId
			});
		}
	}

	for (const members of cycles(ids, asEdges(edges))) {
		if (members.length < 2) continue;
		issues.push({
			level: 'info',
			code: 'relation-cycle',
			message: `${names(members)} relate to each other in a cycle; the back-reference is added in a second migration step.`,
			collectionId: members[0]!,
			related: members
		});
	}

	for (const members of cycles(ids, asEdges(edges.filter((e) => e.field.required)))) {
		issues.push({
			level: 'error',
			code: 'relation-cycle-required',
			message: `${names(members)} require each other: no record could ever be created on either side. Make one side optional.`,
			collectionId: members[0]!,
			related: members
		});
	}

	const cascade = edges.filter((e) => e.field.cascadeDelete);
	for (const members of cycles(ids, asEdges(cascade))) {
		issues.push({
			level: 'warning',
			code: 'cascade-cycle',
			message: `Deleting a record in ${names(members)} cascades around a cycle; check that is intended.`,
			collectionId: members[0]!,
			related: members
		});
		const memberSet = new Set(members);
		for (const edge of cascade) {
			if (edge.field.required && memberSet.has(edge.collectionId) && memberSet.has(edge.targetId)) {
				const collection = collections.get(edge.collectionId)!;
				issues.push({
					level: 'warning',
					code: 'cascade-cycle-required',
					message: `"${label(collection, edge.field)}" is required inside a cascade cycle; a cascade that empties it aborts the delete.`,
					collectionId: collection.id,
					fieldId: edge.fieldId
				});
			}
		}
	}

	return issues;
};

/** Issues on the way from `base` to `next`. */
export const lintChangeSet = (base: Schema, next: Schema, changeSet: ChangeSet): Issue[] => {
	const issues: Issue[] = [];
	const baseById = byId(base);
	const dropped = new Set(
		changeSet.ops.filter((op) => op.kind === 'dropCollection').map((op) => op.collectionId)
	);

	const push = (op: Op, issue: Omit<Issue, 'collectionId'> & { collectionId?: string }) => {
		issues.push({
			collectionId: 'collectionId' in op ? op.collectionId : op.collection.id,
			...issue
		});
	};

	for (const op of changeSet.ops) {
		switch (op.kind) {
			case 'dropCollection': {
				if (op.collection.system) {
					push(op, {
						level: 'error',
						code: 'drop-system-collection',
						message: `"${op.name}" is a PocketBase system collection and cannot be deleted.`
					});
					break;
				}
				const referrers = base.collections.filter(
					(c) =>
						c.id !== op.collectionId &&
						!dropped.has(c.id) &&
						c.fields.some((f) => isRelation(f) && f.collectionId === op.collectionId)
				);
				push(op, {
					level: 'warning',
					code: 'drop-collection',
					message:
						referrers.length > 0
							? `Deleting "${op.name}" removes all its records and the relation fields in ${referrers.map((c) => c.name).join(', ')} that point at it.`
							: `Deleting "${op.name}" removes all its records.`,
					related: referrers.map((c) => c.id)
				});
				break;
			}
			case 'dropField': {
				const collection = baseById.get(op.collectionId);
				const name = collection ? `${collection.name}.${op.name}` : op.name;
				if (op.field.system) {
					push(op, {
						level: 'error',
						code: 'drop-system-field',
						message: `"${name}" is a system field and cannot be removed.`,
						fieldId: op.fieldId
					});
				} else {
					push(op, {
						level: 'warning',
						code: 'drop-field',
						message: `Removing "${name}" deletes its data.`,
						fieldId: op.fieldId
					});
				}
				break;
			}
			case 'replaceField': {
				const collection = baseById.get(op.collectionId);
				const name = collection ? `${collection.name}.${op.name}` : op.name;
				push(op, {
					level: 'warning',
					code: op.reason === 'type' ? 'field-type-change' : 'relation-target-change',
					message:
						op.reason === 'type'
							? `Changing "${name}" from ${op.from.type} to ${op.to.type} drops the field and recreates it; existing values are lost.`
							: `Pointing "${name}" at a different collection drops the field and recreates it; existing values are lost.`,
					fieldId: op.fieldId
				});
				break;
			}
			case 'updateField': {
				if (isMultiple(op.from) && !isMultiple(op.to)) {
					const collection = baseById.get(op.collectionId);
					const name = collection ? `${collection.name}.${op.name}` : op.name;
					push(op, {
						level: 'warning',
						code: 'field-narrowed',
						message: `"${name}" becomes single-value; records keep only their first value.`,
						fieldId: op.fieldId
					});
				}
				if (op.from.system) {
					const changedFlags = op.changed.filter(
						(key) => key !== 'hidden' && key !== 'presentable'
					);
					if (changedFlags.length > 0) {
						push(op, {
							level: 'error',
							code: 'update-system-field',
							message: `System field "${op.name}" cannot change ${changedFlags.join(', ')}.`,
							fieldId: op.fieldId
						});
					}
				}
				break;
			}
			case 'renameField': {
				const collection = baseById.get(op.collectionId);
				const field = collection?.fields.find((f) => f.id === op.fieldId);
				if (field?.system) {
					push(op, {
						level: 'error',
						code: 'rename-system-field',
						message: `System field "${op.from}" cannot be renamed.`,
						fieldId: op.fieldId
					});
				}
				break;
			}
			case 'renameCollection': {
				if (baseById.get(op.collectionId)?.system) {
					push(op, {
						level: 'error',
						code: 'rename-system-collection',
						message: `System collection "${op.from}" cannot be renamed.`
					});
				}
				break;
			}
			default:
				break;
		}
	}

	void next;
	return issues;
};

export const lint = (base: Schema, next: Schema, changeSet: ChangeSet): Issue[] => [
	...lintSchema(next),
	...lintChangeSet(base, next, changeSet)
];

export const hasErrors = (issues: readonly Issue[]): boolean =>
	issues.some((issue) => issue.level === 'error');

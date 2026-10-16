/**
 * From a change set to an ordered plan PocketBase will accept.
 *
 * PocketBase saves one collection at a time, and three rules decide the
 * order (all verified against 0.40):
 *
 * - a relation's target must already be saved, so a collection cannot point
 *   at a collection created later, or at itself, in the save that creates it;
 * - a collection that other collections relate to cannot be deleted;
 * - a collection's own self-relations do not block its deletion.
 *
 * So the plan runs in four phases:
 *
 * 1. strip relation fields that point at collections being dropped (from
 *    surviving collections, and from dropped collections that reference each
 *    other in a cycle);
 * 2. delete dropped collections, referrers before targets;
 * 3. create new collections in dependency order, each without the relation
 *    fields whose target does not exist yet, then update existing
 *    collections to their final state;
 * 4. add the deferred relation fields.
 *
 * Every step carries the complete desired state of its collection, so
 * applying is a plain create, update or delete with that body.
 */

import { diff, type ChangeSet, type Op } from './diff.js';
import { topological, type Edge } from './graph.js';
import { isRelation, type Collection, type Field, type Schema } from './types.js';

export type Phase = 1 | 2 | 3 | 4;

export type Step =
	| {
			kind: 'create';
			phase: 3;
			collectionId: string;
			name: string;
			collection: Collection;
			ops: Op[];
	  }
	| {
			kind: 'update';
			phase: Phase;
			collectionId: string;
			name: string;
			collection: Collection;
			ops: Op[];
	  }
	| { kind: 'delete'; phase: 2; collectionId: string; name: string; ops: Op[] };

export interface Plan {
	steps: Step[];
}

const without = (collection: Collection, fieldIds: Set<string>): Collection => ({
	...collection,
	fields: collection.fields.filter((f) => !fieldIds.has(f.id))
});

const relationTargets = (collection: Collection): Edge[] =>
	collection.fields.filter(isRelation).map((f) => ({ from: collection.id, to: f.collectionId }));

/**
 * `next` with every `replaceField` applied: the replaced field carries the
 * fresh id the diff minted, since PocketBase refuses the old id with a new
 * type or target. This is the state the database will actually hold after
 * the plan runs, and what an editor should adopt once it has applied.
 */
export const materialize = (next: Schema, changeSet: ChangeSet): Schema => {
	const replacements = new Map<string, Map<string, Field>>();
	for (const op of changeSet.ops) {
		if (op.kind !== 'replaceField') continue;
		if (!replacements.has(op.collectionId)) replacements.set(op.collectionId, new Map());
		replacements.get(op.collectionId)!.set(op.fieldId, op.to);
	}
	if (replacements.size === 0) return next;
	return {
		collections: next.collections.map((collection) => {
			const swaps = replacements.get(collection.id);
			if (!swaps) return collection;
			return { ...collection, fields: collection.fields.map((f) => swaps.get(f.id) ?? f) };
		})
	};
};

export const plan = (
	base: Schema,
	desired: Schema,
	changeSet: ChangeSet = diff(base, desired)
): Plan => {
	const steps: Step[] = [];
	const next = materialize(desired, changeSet);
	const baseById = new Map(base.collections.map((c) => [c.id, c]));
	const nextById = new Map(next.collections.map((c) => [c.id, c]));

	const opsFor = (collectionId: string): Op[] =>
		changeSet.ops.filter((op) =>
			'collectionId' in op ? op.collectionId === collectionId : op.collection.id === collectionId
		);

	const droppedIds = new Set<string>();
	const createdIds = new Set<string>();
	for (const op of changeSet.ops) {
		if (op.kind === 'dropCollection') droppedIds.add(op.collectionId);
		if (op.kind === 'createCollection') createdIds.add(op.collection.id);
	}

	// Phase 1: strip relation fields pointing at dropped collections.
	// Surviving collections lose every such field. Dropped collections are
	// deleted referrers-first, so only the edges the topological order had to
	// break (cycles among them) need stripping.
	const droppedList = [...droppedIds];
	const droppedEdges = droppedList.flatMap((id) =>
		relationTargets(baseById.get(id)!).filter((e) => droppedIds.has(e.to) && e.to !== e.from)
	);
	const dropOrder = topological(droppedList, droppedEdges);
	const brokenEdges = new Set(dropOrder.deferred.map((e) => `${e.from}->${e.to}`));

	for (const collection of base.collections) {
		const isDropped = droppedIds.has(collection.id);
		const strip = new Set(
			collection.fields
				.filter(
					(f) =>
						isRelation(f) &&
						droppedIds.has(f.collectionId) &&
						f.collectionId !== collection.id &&
						(!isDropped || brokenEdges.has(`${collection.id}->${f.collectionId}`))
				)
				.map((f) => f.id)
		);
		if (strip.size === 0) continue;
		steps.push({
			kind: 'update',
			phase: 1,
			collectionId: collection.id,
			name: collection.name,
			collection: without(collection, strip),
			ops: opsFor(collection.id).filter((op) => op.kind === 'dropField' && strip.has(op.fieldId))
		});
	}

	// Phase 2: delete, referrers before targets. `topological` puts
	// dependencies (targets) first, so reverse it.
	const deleteOrder = [...dropOrder.order].reverse();
	for (const id of deleteOrder) {
		const collection = baseById.get(id)!;
		steps.push({
			kind: 'delete',
			phase: 2,
			collectionId: id,
			name: collection.name,
			ops: opsFor(id).filter((op) => op.kind === 'dropCollection')
		});
	}

	// Phase 3a: create, dependencies first. Views depend on every new
	// non-view collection their query might read.
	const createdList = next.collections.filter((c) => createdIds.has(c.id)).map((c) => c.id);
	const createdEdges: Edge[] = [];
	for (const id of createdList) {
		const collection = nextById.get(id)!;
		for (const edge of relationTargets(collection)) {
			if (createdIds.has(edge.to)) createdEdges.push(edge);
		}
		if (collection.type === 'view') {
			for (const other of createdList) {
				if (other !== id && nextById.get(other)!.type !== 'view') {
					createdEdges.push({ from: id, to: other });
				}
			}
		}
	}
	const { order: createOrder } = topological(createdList, createdEdges);
	const existsBy = new Set<string>(
		base.collections.filter((c) => !droppedIds.has(c.id)).map((c) => c.id)
	);
	const deferred = new Map<string, Set<string>>();

	for (const id of createOrder) {
		const collection = nextById.get(id)!;
		const defer = new Set(
			collection.fields
				.filter(
					(f): f is Field & { type: 'relation' } => isRelation(f) && !existsBy.has(f.collectionId)
				)
				.map((f) => f.id)
		);
		if (defer.size > 0) deferred.set(id, defer);
		steps.push({
			kind: 'create',
			phase: 3,
			collectionId: id,
			name: collection.name,
			collection: without(collection, defer),
			ops: opsFor(id)
		});
		existsBy.add(id);
	}

	// Phase 3b: existing collections to their final state. Every new
	// collection now exists, so nothing here needs deferring.
	for (const collection of next.collections) {
		if (createdIds.has(collection.id) || !baseById.has(collection.id)) continue;
		const ops = opsFor(collection.id).filter(
			(op) => op.kind !== 'dropField' || !steps.some((s) => s.phase === 1 && s.ops.includes(op))
		);
		if (ops.length === 0) continue;
		steps.push({
			kind: 'update',
			phase: 3,
			collectionId: collection.id,
			name: collection.name,
			collection,
			ops
		});
	}

	// Phase 4: deferred relation fields.
	for (const [id, fieldIds] of deferred) {
		const collection = nextById.get(id)!;
		steps.push({
			kind: 'update',
			phase: 4,
			collectionId: id,
			name: collection.name,
			collection,
			ops: opsFor(id).filter(
				(op) =>
					op.kind === 'createCollection' || (op.kind === 'addField' && fieldIds.has(op.field.id))
			)
		});
	}

	return { steps };
};

/** How many saves PocketBase will make, which is how many migration files it writes. */
export const stepCount = (p: Plan): number => p.steps.length;

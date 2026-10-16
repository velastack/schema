/**
 * The editor's state: the database as it is (`base`), the schema the user
 * wants (`next`), and everything derived from the two by the engine. Every
 * edit goes through `commit`, which snapshots `next` for undo. Nothing here
 * knows about the canvas; positions are kept alongside so a reload lands
 * cards where they were.
 */

import {
	CARD_HEADER,
	CARD_ROW,
	CARD_WIDTH,
	annotate,
	diff,
	hasErrors,
	isRelation,
	layout as computeLayout,
	lint,
	plan as computePlan,
	randomIds,
	summarize,
	type Collection,
	type Field,
	type FieldType,
	type Schema
} from '@velastack/schema';

/** Context key under which the editor hands its state to canvas components. */
export const EDITOR_CONTEXT = Symbol('schema-editor');

export interface Position {
	x: number;
	y: number;
}

export type Selection = { collectionId: string; fieldId?: string } | null;

/** A type choice from the row menu: a plain type, or a relation to a collection. */
export type TypeChoice =
	{ type: Exclude<FieldType, 'relation'> } | { type: 'relation'; target: string };

const clone = <T>(value: T): T => structuredClone(value);

const defaultsFor = (choice: TypeChoice, id: string, name: string): Field => {
	switch (choice.type) {
		case 'relation':
			return {
				id,
				name,
				type: 'relation',
				collectionId: choice.target,
				maxSelect: 1,
				cascadeDelete: false
			};
		case 'select':
			return { id, name, type: 'select', values: [], maxSelect: 1 };
		case 'file':
			return { id, name, type: 'file', maxSelect: 1 };
		case 'autodate':
			return { id, name, type: 'autodate', onCreate: true, onUpdate: name.includes('update') };
		default:
			return { id, name, type: choice.type } as Field;
	}
};

export class EditorState {
	base = $state.raw<Schema>({ collections: [] });
	next = $state.raw<Schema>({ collections: [] });
	positions = $state<Record<string, Position>>({});
	selection = $state<Selection>(null);
	/** A collection whose name input should take focus once, right after it was created. */
	focusName = $state<string | null>(null);
	/** An AI answer shown as the working state, with what it replaced, until accepted or discarded. */
	proposal = $state.raw<{ before: Schema; summary: string } | null>(null);
	project = $state<string | undefined>(undefined);

	#past = $state.raw<Schema[]>([]);
	#future = $state.raw<Schema[]>([]);
	#ids = randomIds();

	readonly changes = $derived(diff(this.base, this.next));
	readonly issues = $derived(lint(this.base, this.next, this.changes));
	readonly diagram = $derived(annotate(this.base, this.next, this.changes, { focus: 'all' }));
	readonly plan = $derived(computePlan(this.base, this.next, this.changes));
	readonly summary = $derived(summarize(this.changes));
	readonly dirty = $derived(this.changes.ops.length > 0);
	readonly blocked = $derived(hasErrors(this.issues));
	readonly canUndo = $derived(this.#past.length > 0);
	readonly canRedo = $derived(this.#future.length > 0);

	/** Issues for one collection or field, for badges. */
	issuesFor(collectionId: string, fieldId?: string) {
		return this.issues.filter(
			(issue) =>
				issue.collectionId === collectionId &&
				(fieldId === undefined ? true : issue.fieldId === fieldId)
		);
	}

	load(base: Schema, project?: string, positions?: Record<string, Position>) {
		this.base = base;
		this.next = clone(base);
		this.project = project;
		this.#past = [];
		this.#future = [];
		this.positions = positions ?? this.autoLayout();
	}

	/** After an apply: the database is the new base and the work is done. */
	applied(base: Schema) {
		this.base = base;
		this.next = clone(base);
		this.#past = [];
		this.#future = [];
	}

	/** Every edit: snapshot, mutate a copy, swap it in. */
	commit(mutate: (draft: Schema) => void) {
		const draft = clone(this.next);
		mutate(draft);
		this.#past = [...this.#past, this.next];
		this.#future = [];
		this.next = draft;
	}

	undo() {
		const previous = this.#past.at(-1);
		if (!previous) return;
		this.#future = [this.next, ...this.#future];
		this.#past = this.#past.slice(0, -1);
		this.next = previous;
	}

	redo() {
		const following = this.#future[0];
		if (!following) return;
		this.#past = [...this.#past, this.next];
		this.#future = this.#future.slice(1);
		this.next = following;
	}

	discard() {
		this.commit((draft) => {
			draft.collections = clone(this.base.collections);
		});
	}

	/** Dagre positions for everything currently drawn. */
	autoLayout(): Record<string, Position> {
		const schema: Schema = {
			collections: this.diagram.collections
				.filter((entry) => !entry.locked)
				.map((entry) => ({
					...entry.collection,
					fields: entry.fields.map((f) => f.field)
				}))
		};
		const result = computeLayout(schema);
		const positions: Record<string, Position> = {};
		for (const [id, node] of Object.entries(result.nodes)) positions[id] = { x: node.x, y: node.y };
		return positions;
	}

	relayout() {
		this.positions = this.autoLayout();
	}

	setPosition(collectionId: string, position: Position) {
		this.positions = { ...this.positions, [collectionId]: position };
	}

	collection(id: string): Collection | undefined {
		return this.next.collections.find((c) => c.id === id);
	}

	/** Names collections can use for a new table: `table_2` when `table` is taken. */
	#freeName(prefix: string): string {
		const taken = new Set(this.next.collections.map((c) => c.name));
		if (!taken.has(prefix)) return prefix;
		for (let i = 2; ; i++) if (!taken.has(`${prefix}_${i}`)) return `${prefix}_${i}`;
	}

	/** The nearest spot to `preferred` where a new card overlaps no card already placed. */
	#freePosition(preferred: Position): Position {
		const gap = 24;
		const boxes = this.diagram.collections
			.filter((entry) => !entry.locked)
			.map((entry) => {
				const at = this.positions[entry.collection.id] ?? { x: 0, y: 0 };
				return {
					x: at.x,
					y: at.y,
					w: CARD_WIDTH,
					h: CARD_HEADER + entry.fields.length * CARD_ROW + 32
				};
			});
		const overlaps = (p: Position) =>
			boxes.some(
				(b) =>
					p.x < b.x + b.w + gap &&
					b.x < p.x + CARD_WIDTH + gap &&
					p.y < b.y + b.h + gap &&
					b.y < p.y + 120 + gap
			);
		if (!overlaps(preferred)) return preferred;
		// Spiral out in card-sized steps until a spot is free.
		for (let ring = 1; ring < 20; ring++) {
			for (const [dx, dy] of [
				[1, 0],
				[0, 1],
				[-1, 0],
				[0, -1],
				[1, 1],
				[-1, 1],
				[1, -1],
				[-1, -1]
			] as const) {
				const candidate = {
					x: preferred.x + dx * ring * (CARD_WIDTH + gap),
					y: preferred.y + dy * ring * 160
				};
				if (!overlaps(candidate)) return candidate;
			}
		}
		return preferred;
	}

	addCollection(preferred: Position, name = 'table'): string {
		const position = this.#freePosition(preferred);
		const id = this.#ids.collection(name);
		const collection: Collection = {
			id,
			name: this.#freeName(name),
			type: 'base',
			fields: [
				{
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
				}
			],
			indexes: [],
			rules: { list: null, view: null, create: null, update: null, delete: null }
		};
		this.commit((draft) => {
			draft.collections.push(collection);
		});
		this.positions = { ...this.positions, [id]: position };
		this.selection = { collectionId: id };
		this.focusName = id;
		return id;
	}

	renameCollection(id: string, name: string) {
		const trimmed = name.trim();
		if (!trimmed || this.collection(id)?.name === trimmed) return;
		this.commit((draft) => {
			const c = draft.collections.find((x) => x.id === id);
			if (c) c.name = trimmed;
		});
	}

	/** Dropping a collection also drops the fields that point at it, as PocketBase will. */
	removeCollection(id: string) {
		this.commit((draft) => {
			draft.collections = draft.collections.filter((c) => c.id !== id);
			for (const c of draft.collections) {
				c.fields = c.fields.filter((f) => !(isRelation(f) && f.collectionId === id));
			}
		});
		if (this.selection?.collectionId === id) this.selection = null;
	}

	/** Bring back a collection the base has; its fields come back with it. */
	restoreCollection(id: string) {
		const original = this.base.collections.find((c) => c.id === id);
		if (!original) return;
		this.commit((draft) => {
			if (!draft.collections.some((c) => c.id === id)) draft.collections.push(clone(original));
		});
	}

	addField(
		collectionId: string,
		name: string,
		choice: TypeChoice = { type: 'text' }
	): string | undefined {
		const trimmed = name.trim();
		if (!trimmed) return undefined;
		const id = this.#ids.field(choice.type, trimmed);
		this.commit((draft) => {
			const c = draft.collections.find((x) => x.id === collectionId);
			if (!c) return;
			c.fields.push(defaultsFor(choice, id, trimmed));
		});
		return id;
	}

	renameField(collectionId: string, fieldId: string, name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		this.commit((draft) => {
			const f = draft.collections
				.find((x) => x.id === collectionId)
				?.fields.find((x) => x.id === fieldId);
			if (f && f.name !== trimmed) f.name = trimmed;
		});
	}

	/**
	 * Change a field's type. The id is kept: the engine turns a type change
	 * into a replacement with a fresh id when it plans, and the lint says
	 * what that costs.
	 */
	setFieldType(collectionId: string, fieldId: string, choice: TypeChoice) {
		this.commit((draft) => {
			const c = draft.collections.find((x) => x.id === collectionId);
			const index = c?.fields.findIndex((x) => x.id === fieldId) ?? -1;
			if (!c || index < 0) return;
			const before = c.fields[index]!;
			if (
				before.type === choice.type &&
				!(choice.type === 'relation' && isRelation(before) && before.collectionId !== choice.target)
			) {
				return;
			}
			const after = defaultsFor(choice, before.id, before.name);
			if (before.required) after.required = true;
			if (before.hidden) after.hidden = true;
			c.fields[index] = after;
		});
	}

	updateField(collectionId: string, fieldId: string, patch: Partial<Field>) {
		this.commit((draft) => {
			const c = draft.collections.find((x) => x.id === collectionId);
			const index = c?.fields.findIndex((x) => x.id === fieldId) ?? -1;
			if (!c || index < 0) return;
			c.fields[index] = { ...c.fields[index]!, ...patch } as Field;
		});
	}

	removeField(collectionId: string, fieldId: string) {
		this.commit((draft) => {
			const c = draft.collections.find((x) => x.id === collectionId);
			if (c) c.fields = c.fields.filter((f) => f.id !== fieldId);
		});
		if (this.selection?.fieldId === fieldId) this.selection = { collectionId };
	}

	restoreField(collectionId: string, fieldId: string) {
		const original = this.base.collections
			.find((c) => c.id === collectionId)
			?.fields.find((f) => f.id === fieldId);
		if (!original) return;
		this.commit((draft) => {
			const c = draft.collections.find((x) => x.id === collectionId);
			if (c && !c.fields.some((f) => f.id === fieldId)) {
				// Back into its old slot when possible.
				const baseOrder = this.base.collections
					.find((x) => x.id === collectionId)!
					.fields.map((f) => f.id);
				const after = baseOrder
					.slice(0, baseOrder.indexOf(fieldId))
					.filter((id) => c.fields.some((f) => f.id === id));
				const at = after.length ? c.fields.findIndex((f) => f.id === after.at(-1)) + 1 : 0;
				c.fields.splice(at, 0, clone(original));
			}
		});
	}

	/**
	 * Show an AI answer as the working state. The cards draw its difference
	 * from the base; accepting keeps it as one undoable step, discarding
	 * goes back to what was there. A second proposal on top of a first
	 * keeps the original "before".
	 */
	propose(schema: Schema, summary: string) {
		this.proposal = { before: this.proposal?.before ?? this.next, summary };
		this.next = schema;
		this.selection = null;
	}

	acceptProposal() {
		if (!this.proposal) return;
		this.#past = [...this.#past, this.proposal.before];
		this.#future = [];
		this.proposal = null;
	}

	discardProposal() {
		if (!this.proposal) return;
		this.next = this.proposal.before;
		this.proposal = null;
	}

	/** Dragging a row onto a table: the field becomes a relation to it. */
	connect(collectionId: string, fieldId: string, targetId: string) {
		this.setFieldType(collectionId, fieldId, { type: 'relation', target: targetId });
	}
}

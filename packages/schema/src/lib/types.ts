/**
 * The canonical schema model.
 *
 * It mirrors PocketBase's collection JSON (0.23+) with one rule added on top:
 * every collection and every field carries an `id`, and identity is the id,
 * never the name. PocketBase matches fields by id when it syncs a collection
 * to its SQLite table, so a changed name on a kept id is a rename and a
 * missing id is a drop. The diff in `diff.ts` leans on that and needs no
 * rename heuristics.
 *
 * Collection-level settings the engine does not model (auth options, email
 * templates, token durations) ride along in `extra` and are passed through
 * untouched.
 */

export type CollectionType = 'base' | 'auth' | 'view';

export type FieldType =
	| 'text'
	| 'editor'
	| 'number'
	| 'bool'
	| 'email'
	| 'url'
	| 'date'
	| 'autodate'
	| 'select'
	| 'file'
	| 'relation'
	| 'json'
	| 'geoPoint'
	| 'password';

export const FIELD_TYPES: readonly FieldType[] = [
	'text',
	'editor',
	'number',
	'bool',
	'email',
	'url',
	'date',
	'autodate',
	'select',
	'file',
	'relation',
	'json',
	'geoPoint',
	'password'
];

/** Flags every PocketBase field carries. */
export interface FieldBase {
	id: string;
	name: string;
	/** Added by PocketBase itself (`id`, `created`, auth fields). Never editable. */
	system?: boolean;
	hidden?: boolean;
	presentable?: boolean;
	required?: boolean;
	/** Shown under the input in the PocketBase dashboard. */
	help?: string;
}

export interface TextField extends FieldBase {
	type: 'text';
	min?: number;
	max?: number;
	pattern?: string;
	autogeneratePattern?: string;
	primaryKey?: boolean;
}

export interface EditorField extends FieldBase {
	type: 'editor';
	maxSize?: number;
	convertURLs?: boolean;
}

export interface NumberField extends FieldBase {
	type: 'number';
	min?: number | null;
	max?: number | null;
	onlyInt?: boolean;
}

export interface BoolField extends FieldBase {
	type: 'bool';
}

export interface EmailField extends FieldBase {
	type: 'email';
	exceptDomains?: string[] | null;
	onlyDomains?: string[] | null;
}

export interface UrlField extends FieldBase {
	type: 'url';
	exceptDomains?: string[] | null;
	onlyDomains?: string[] | null;
}

export interface DateField extends FieldBase {
	type: 'date';
	min?: string;
	max?: string;
}

export interface AutodateField extends FieldBase {
	type: 'autodate';
	onCreate?: boolean;
	onUpdate?: boolean;
}

export interface SelectField extends FieldBase {
	type: 'select';
	values: string[];
	/** `<= 1` is a single value; `>= 2` stores a JSON array. */
	maxSelect?: number;
}

export interface FileField extends FieldBase {
	type: 'file';
	maxSize?: number;
	maxSelect?: number;
	mimeTypes?: string[];
	thumbs?: string[];
	protected?: boolean;
}

export interface RelationField extends FieldBase {
	type: 'relation';
	/** The target collection's id. Must exist when the field is saved. */
	collectionId: string;
	cascadeDelete?: boolean;
	minSelect?: number;
	maxSelect?: number;
}

export interface JsonField extends FieldBase {
	type: 'json';
	maxSize?: number;
}

export interface GeoPointField extends FieldBase {
	type: 'geoPoint';
}

export interface PasswordField extends FieldBase {
	type: 'password';
	min?: number;
	max?: number;
	pattern?: string;
	cost?: number;
}

export type Field =
	| TextField
	| EditorField
	| NumberField
	| BoolField
	| EmailField
	| UrlField
	| DateField
	| AutodateField
	| SelectField
	| FileField
	| RelationField
	| JsonField
	| GeoPointField
	| PasswordField;

/**
 * API rules. `null` means superusers only, `''` means anyone, and any other
 * string is a PocketBase filter expression.
 */
export interface Rules {
	list: string | null;
	view: string | null;
	create: string | null;
	update: string | null;
	delete: string | null;
}

export interface Collection {
	id: string;
	name: string;
	type: CollectionType;
	/** PocketBase's own collections (`_superusers`, `_authOrigins`, ...). */
	system?: boolean;
	fields: Field[];
	/** Raw `CREATE INDEX` statements, as PocketBase stores them. */
	indexes: string[];
	rules: Rules;
	/** View collections only. */
	viewQuery?: string;
	/** Collection settings the engine passes through without modelling. */
	extra?: Record<string, unknown>;
}

export interface Schema {
	collections: Collection[];
}

export const SUPERUSER_RULES: Rules = {
	list: null,
	view: null,
	create: null,
	update: null,
	delete: null
};

export const isRelation = (field: Field): field is RelationField => field.type === 'relation';

/** Fields that store several values when `maxSelect >= 2`. */
export const isMultiple = (field: Field): boolean =>
	(field.type === 'select' || field.type === 'file' || field.type === 'relation') &&
	(field.maxSelect ?? 1) >= 2;

export const findCollection = (schema: Schema, idOrName: string): Collection | undefined =>
	schema.collections.find((c) => c.id === idOrName) ??
	schema.collections.find((c) => c.name === idOrName);

export const findField = (collection: Collection, idOrName: string): Field | undefined =>
	collection.fields.find((f) => f.id === idOrName) ??
	collection.fields.find((f) => f.name === idOrName);

/** Every relation edge in the schema: owning collection and field, target collection. */
export interface RelationEdge {
	collectionId: string;
	fieldId: string;
	field: RelationField;
	targetId: string;
}

export const relationEdges = (schema: Schema): RelationEdge[] => {
	const edges: RelationEdge[] = [];
	for (const collection of schema.collections) {
		for (const field of collection.fields) {
			if (isRelation(field)) {
				edges.push({
					collectionId: collection.id,
					fieldId: field.id,
					field,
					targetId: field.collectionId
				});
			}
		}
	}
	return edges;
};

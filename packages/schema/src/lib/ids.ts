/**
 * Id minting.
 *
 * PocketBase names a field's id after its type and the CRC32 of its name
 * (`text1579384326` is `text` + crc32("name")), so a field we create gets the
 * same id the dashboard would give it. Verified against 0.40.6: every
 * collection's `id` field is `text3208210256`, every `created` is
 * `autodate2990389176`.
 *
 * Collection ids are `pbc_` plus ten digits that are not derived from the
 * name. Ours follow the shape; PocketBase accepts any value.
 */

import type { FieldType } from './types.js';

export interface IdMinter {
	collection(hint?: string): string;
	/** The id PocketBase would mint for this field name, unless a different hint is given. */
	field(type: FieldType, hint: string): string;
}

/** The built-in auth collection PocketBase creates on first start. */
export const USERS_COLLECTION_ID = '_pb_users_auth_';
/** The built-in superusers collection. */
export const SUPERUSERS_COLLECTION_ID = 'pbc_3142635823';

const TEN_DIGITS = 10_000_000_000;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC32 (IEEE) of a string's UTF-8 bytes, as PocketBase's `crc32.ChecksumIEEE`. */
export const crc32 = (input: string): number => {
	const bytes = new TextEncoder().encode(input);
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
};

const digits = (n: number): string => String(n % TEN_DIGITS).padStart(10, '0');

/** The id PocketBase gives a field of `type` named `name`. */
export const pocketbaseFieldId = (type: FieldType, name: string): string => `${type}${crc32(name)}`;

/** Random collection ids, PocketBase-shaped field ids; for interactive editing. */
export const randomIds = (): IdMinter => ({
	collection: () => `pbc_${digits(Math.floor(Math.random() * TEN_DIGITS))}`,
	field: pocketbaseFieldId
});

/**
 * Deterministic collection ids derived from a seed and the collection name,
 * so a preview rendered twice has stable ids and a test can assert on them.
 * Field ids follow PocketBase's rule.
 */
export const seededIds = (seed = ''): IdMinter => ({
	collection: (hint = '') => `pbc_${digits(crc32(`${seed}:${hint}`))}`,
	field: pocketbaseFieldId
});

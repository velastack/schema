import { describe, expect, it } from 'vitest';
import { crc32, pocketbaseFieldId, randomIds, seededIds } from './ids.js';

describe('ids', () => {
	it('mints the field ids PocketBase itself uses', () => {
		// Read off a PocketBase 0.40.6 database.
		expect(pocketbaseFieldId('text', 'id')).toBe('text3208210256');
		expect(pocketbaseFieldId('text', 'name')).toBe('text1579384326');
		expect(pocketbaseFieldId('password', 'password')).toBe('password901924565');
		expect(pocketbaseFieldId('autodate', 'created')).toBe('autodate2990389176');
		expect(pocketbaseFieldId('file', 'avatar')).toBe('file376926767');
	});

	it('computes IEEE crc32', () => {
		expect(crc32('')).toBe(0);
		expect(crc32('name')).toBe(1579384326);
	});

	it('seeds collection ids deterministically in PocketBase shape', () => {
		const a = seededIds('x');
		const b = seededIds('x');
		expect(a.collection('teams')).toBe(b.collection('teams'));
		expect(a.collection('teams')).toMatch(/^pbc_\d{10}$/);
		expect(a.collection('teams')).not.toBe(a.collection('users'));
		expect(seededIds('y').collection('teams')).not.toBe(a.collection('teams'));
	});

	it('random collection ids have the same shape', () => {
		expect(randomIds().collection()).toMatch(/^pbc_\d{10}$/);
	});
});

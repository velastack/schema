/**
 * The planner and applier against a real PocketBase, the `pocketbase-server`
 * binary this package develops against. Every shape the planner reasons
 * about is applied here and the database re-read, so a PocketBase rule the
 * unit tests only assume is checked for real.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apply, fetchClient, type CollectionsClient } from './apply.js';
import { diff } from './diff.js';
import { lint, hasErrors } from './lint.js';
import { materialize, plan } from './plan.js';
import { completeSchema } from './normalize/builtins.js';
import { schemaFromPocketBase } from './normalize/pocketbase.js';
import { USERS_COLLECTION_ID } from './ids.js';
import { collection, relation, text } from './testing/fixtures.js';
import type { Schema } from './types.js';

const EMAIL = 'admin@example.com';
const PASSWORD = 'password1234';

const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address() as net.AddressInfo;
			server.close(() => resolve(address.port));
		});
	});

const waitForHealth = async (url: string, proc: ChildProcess) => {
	for (let attempt = 0; attempt < 80; attempt++) {
		if (proc.exitCode !== null) throw new Error(`PocketBase exited with ${proc.exitCode}`);
		try {
			const response = await fetch(`${url}/api/health`);
			if (response.ok) return;
		} catch {
			// not up yet
		}
		await new Promise((r) => setTimeout(r, 125));
	}
	throw new Error(`PocketBase at ${url} never became healthy`);
};

let dir: string;
let migrations: string;
let proc: ChildProcess;
let url: string;
let client: CollectionsClient;

const readSchema = async () => schemaFromPocketBase(await client.list());
const files = () => fs.readdirSync(migrations).sort();

/** Plan, lint, apply, and check the database now matches. */
const roundTrip = async (base: Schema, desired: Schema) => {
	const next = completeSchema(desired);
	const changes = diff(base, next);
	const issues = lint(base, next, changes);
	expect(hasErrors(issues), JSON.stringify(issues)).toBe(false);
	const steps = plan(base, next, changes);
	const before = files();
	const result = await apply(client, steps);
	expect(result.failed, JSON.stringify(result.failed?.error)).toBeUndefined();
	const written = files().filter((f) => !before.includes(f));
	expect(written).toHaveLength(steps.steps.length);
	// One file per save, each in its own second, in step order.
	const stamps = written.map((f) => Number(f.split('_')[0]));
	expect(new Set(stamps).size).toBe(stamps.length);
	expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
	const after = await readSchema();
	expect(diff(after, materialize(next, changes)).ops).toEqual([]);
	return after;
};

beforeAll(async () => {
	const { getBinaryPath } = await import('pocketbase-server');
	const binary = getBinaryPath();
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velastack-schema-'));
	migrations = path.join(dir, 'migrations');
	fs.mkdirSync(migrations);
	const data = path.join(dir, 'data');
	const created = spawnSync(
		binary,
		['superuser', 'create', EMAIL, PASSWORD, '--dir', data, '--migrationsDir', migrations],
		{ encoding: 'utf8' }
	);
	if (created.status !== 0) throw new Error(created.stderr || created.stdout);
	const port = await freePort();
	url = `http://127.0.0.1:${port}`;
	proc = spawn(
		binary,
		['serve', '--dir', data, '--migrationsDir', migrations, '--http', `127.0.0.1:${port}`],
		{
			stdio: 'ignore'
		}
	);
	await waitForHealth(url, proc);
	const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ identity: EMAIL, password: PASSWORD })
	});
	const { token } = (await auth.json()) as { token: string };
	client = fetchClient(url, token);
}, 60_000);

afterAll(() => {
	proc?.kill();
	if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('apply against PocketBase', { timeout: 120_000 }, () => {
	it('reads the fresh database and finds the built-in users collection', async () => {
		const live = await readSchema();
		const users = live.collections.find((c) => c.id === USERS_COLLECTION_ID);
		expect(users?.name).toBe('users');
		expect(users?.fields.find((f) => f.name === 'id')?.id).toBe('text3208210256');
	});

	it('creates a cycle, a self-relation, a referenced pair, a view and an auth collection', async () => {
		const base = await readSchema();
		const next: Schema = structuredClone(base);
		next.collections.push(
			collection('stripe_customers', [
				relation('user', USERS_COLLECTION_ID),
				relation('default_payment_method', 'pbc_stripe_payment_methods')
			]),
			collection('stripe_payment_methods', [
				text('brand'),
				relation('customer', 'pbc_stripe_customers', { cascadeDelete: true })
			]),
			collection('categories', [text('title'), relation('parent', 'pbc_categories')]),
			collection('authors', [text('name')], {
				indexes: ['CREATE INDEX `idx_authors_name` ON `authors` (`name`)'],
				rules: { list: '', view: '', create: null, update: null, delete: null }
			}),
			collection('books', [text('title'), relation('author', 'pbc_authors')]),
			collection('staff', [text('department')], { type: 'auth' }),
			collection('author_names', [], {
				type: 'view',
				viewQuery: 'SELECT id, name FROM authors'
			})
		);
		const after = await roundTrip(base, next);
		expect(after.collections.find((c) => c.name === 'staff')?.fields.map((f) => f.name)).toContain(
			'tokenKey'
		);
		expect(
			after.collections.find((c) => c.name === 'author_names')?.fields.map((f) => f.name)
		).toEqual(['id', 'name']);
	});

	it('renames, retypes, changes rules and indexes, and drops referenced collections', async () => {
		const base = await readSchema();
		const next: Schema = structuredClone(base);
		next.collections = next.collections.filter(
			(c) =>
				!['author_names', 'authors', 'stripe_customers', 'stripe_payment_methods'].includes(c.name)
		);
		const books = next.collections.find((c) => c.name === 'books')!;
		books.name = 'publications';
		books.fields = books.fields.filter((f) => f.name !== 'author');
		const title = books.fields.find((f) => f.name === 'title')!;
		title.name = 'headline';
		title.required = true;
		books.rules = { ...books.rules, list: '', view: '' };
		books.indexes = ['CREATE INDEX `idx_publications_headline` ON `publications` (`headline`)'];
		const categories = next.collections.find((c) => c.name === 'categories')!;
		(categories.fields.find((f) => f.name === 'title') as { type: string }).type = 'editor';

		const after = await roundTrip(base, next);
		const publications = after.collections.find((c) => c.name === 'publications')!;
		expect(publications.fields.map((f) => f.name)).toEqual(['id', 'headline']);
		expect(publications.indexes[0]).toContain('idx_publications_headline');
		expect(
			after.collections
				.find((c) => c.name === 'categories')!
				.fields.find((f) => f.name === 'title')!.type
		).toBe('editor');
	});

	it('cannot change a collection type in place, so it recreates under the same id', async () => {
		const base = await readSchema();
		const next: Schema = structuredClone(base);
		next.collections.find((c) => c.name === 'staff')!.type = 'base';
		const after = await roundTrip(base, next);
		expect(after.collections.find((c) => c.name === 'staff')?.type).toBe('base');
	});
});

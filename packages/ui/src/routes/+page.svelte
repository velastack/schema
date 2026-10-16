<script lang="ts">
	/**
	 * The editor app the CLI opens. With `#token=…` in the URL it talks to
	 * the CLI's local server; without one (developing the editor, or a demo)
	 * it runs on an in-memory database seeded with a small schema.
	 */
	import {
		applyPatternResult,
		builtinSchema,
		pocketbaseFieldId,
		randomIds,
		systemIdField,
		type Schema
	} from '@velastack/schema';
	import SchemaEditor from '../lib/components/SchemaEditor.svelte';
	import { EditorState } from '../lib/editor.svelte.js';
	import { httpApi, memoryApi, type SchemaApi } from '../lib/api.js';

	// The token arrives once in the URL fragment and is then kept for this
	// tab only, so a refresh still reaches the server. The origin is a
	// loopback port that exists for one session.
	const TOKEN_KEY = 'vela-schema-token';
	const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
	const token = fromHash ?? readStoredToken();
	if (fromHash) {
		try {
			sessionStorage.setItem(TOKEN_KEY, fromHash);
		} catch {
			// Private windows may refuse; the token still lives in this closure.
		}
	}
	function readStoredToken(): string | null {
		try {
			return sessionStorage.getItem(TOKEN_KEY);
		} catch {
			return null;
		}
	}

	const sample = (): Schema =>
		applyPatternResult(builtinSchema(), {
			collections: [
				{
					name: 'teams',
					type: 'base',
					fields: [
						{ name: 'name', type: 'text', required: true },
						{ name: 'owner', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 }
					]
				},
				{
					name: 'team_memberships',
					type: 'base',
					fields: [
						{ name: 'team', type: 'relation', collectionId: 'teams', maxSelect: 1, cascadeDelete: true },
						{ name: 'user', type: 'relation', collectionId: 'users', maxSelect: 1, cascadeDelete: true },
						{ name: 'role', type: 'select', values: ['owner', 'admin', 'member'], maxSelect: 1 }
					]
				}
			]
		});

	const api: SchemaApi = token ? httpApi(token) : memoryApi(sample());

	// `?mockai` gives the in-memory editor a pretend AI that understands
	// "add <name>", enough to work on the proposal flow without a server.
	if (!token && location.search.includes('mockai')) {
		api.ai = async ({ prompt, schema }) => {
			const name = /add (?:a |an )?(\w+)/i.exec(prompt)?.[1]?.toLowerCase() ?? 'things';
			const id = randomIds().collection(name);
			return {
				schema: {
					collections: [
						...schema.collections,
						{
							id,
							name,
							type: 'base',
							indexes: [],
							rules: { list: null, view: null, create: null, update: null, delete: null },
							fields: [
								systemIdField(),
								{ id: pocketbaseFieldId('text', 'name'), name: 'name', type: 'text', required: true },
								{ id: pocketbaseFieldId('relation', 'owner'), name: 'owner', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 }
							]
						}
					]
				},
				summary: `Added ${name} with a name and an owner.`,
				turn: [
					{ role: 'user', content: prompt },
					{ role: 'assistant', content: '{}' }
				]
			};
		};
		delete api.aiUnavailable;
	}
	const editor = new EditorState();

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let message = $state('');

	$effect(() => {
		api
			.load()
			.then(({ base, project }) => {
				editor.load(base, project);
				if (token) history.replaceState(null, '', location.pathname);
				status = 'ready';
			})
			.catch((error: unknown) => {
				message = error instanceof Error ? error.message : String(error);
				status = 'error';
			});
	});
</script>

<svelte:head>
	<title>{editor.project ? `${editor.project} · schema` : 'Schema'}</title>
</svelte:head>

{#if status === 'ready'}
	<main class="app">
		<SchemaEditor {editor} {api} />
	</main>
{:else if status === 'error'}
	<main class="app app--message">
		<p><strong>Could not reach the schema server.</strong></p>
		<p>{message}</p>
		<p>
			If <code>vela generate migration --ai</code> is still running, open the URL it printed again.
			Otherwise start it and open the new URL.
		</p>
	</main>
{:else}
	<main class="app app--message"><p>Loading…</p></main>
{/if}

<style>
	.app {
		height: 100%;
	}
	.app--message {
		display: grid;
		place-content: center;
		gap: 4px;
		text-align: center;
		color: var(--muted-foreground);
	}
	.app--message strong {
		color: var(--foreground);
	}
	code {
		font-family: var(--font-code);
	}
</style>

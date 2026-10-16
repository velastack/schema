<script lang="ts">
	/**
	 * A gallery of the components against the shapes they will meet, for
	 * eyeballing during development. Not part of the package.
	 */
	import {
		annotate,
		applyPatternResult,
		builtinSchema,
		diagramOf,
		diff,
		type PatternResult,
		type Schema
	} from '@velastack/schema';
	import SchemaDiagram from '../../lib/components/SchemaDiagram.svelte';

	const teams: PatternResult['collections'] = [
		{
			name: 'teams',
			type: 'base',
			fields: [
				{ name: 'name', type: 'text', required: true },
				{ name: 'slug', type: 'text', required: true },
				{ name: 'owner', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
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
		},
		{
			name: 'team_invites',
			type: 'base',
			fields: [
				{ name: 'email', type: 'email', required: true },
				{ name: 'team', type: 'relation', collectionId: 'teams', maxSelect: 1, cascadeDelete: true },
				{ name: 'token', type: 'text' },
				{ name: 'expires', type: 'date' }
			]
		}
	];

	const payments: PatternResult['collections'] = [
		{ name: 'stripe_products', type: 'base', fields: [{ name: 'name', type: 'text' }, { name: 'active', type: 'bool' }] },
		{
			name: 'stripe_prices',
			type: 'base',
			fields: [
				{ name: 'product', type: 'relation', collectionId: 'stripe_products', maxSelect: 1 },
				{ name: 'unit_amount', type: 'number' },
				{ name: 'currency', type: 'text' }
			]
		},
		{
			name: 'stripe_customers',
			type: 'base',
			fields: [
				{ name: 'user', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
				{ name: 'default_payment_method', type: 'relation', collectionId: 'stripe_payment_methods', maxSelect: 1 }
			]
		},
		{
			name: 'stripe_payment_methods',
			type: 'base',
			fields: [
				{ name: 'customer', type: 'relation', collectionId: 'stripe_customers', maxSelect: 1, cascadeDelete: true },
				{ name: 'brand', type: 'text' },
				{ name: 'last4', type: 'text' }
			]
		}
	];

	const base = builtinSchema();
	const withTeams = applyPatternResult(base, { collections: teams });
	const withPayments = applyPatternResult(withTeams, { collections: payments });

	// A migration: rename, retype, add, remove on an existing collection, and drop another.
	const edited: Schema = structuredClone(withPayments);
	const invites = edited.collections.find((c) => c.name === 'team_invites')!;
	invites.fields.find((f) => f.name === 'token')!.name = 'code';
	invites.fields.find((f) => f.name === 'expires')!.type = 'text';
	invites.fields.push({ id: 'text_message', name: 'message', type: 'text' });
	invites.fields = invites.fields.filter((f) => f.name !== 'email');
	edited.collections = edited.collections.filter((c) => c.name !== 'stripe_products');
	const prices = edited.collections.find((c) => c.name === 'stripe_prices')!;
	prices.fields = prices.fields.filter((f) => f.name !== 'product');

	const examples = [
		{ title: 'enable-teams as a pattern page shows it', diagram: annotate(base, withTeams, diff(base, withTeams), { focus: 'changes' }) },
		{ title: 'enable-payments on top of teams (cycle)', diagram: annotate(withTeams, withPayments, diff(withTeams, withPayments), { focus: 'changes' }) },
		{ title: 'a migration: rename, retype, add, remove, drop', diagram: annotate(withPayments, edited, diff(withPayments, edited), { focus: 'changes' }) },
		{ title: 'the whole schema, plain', diagram: diagramOf(withPayments) }
	];
</script>

<main>
	<h1>@velastack/schema-ui</h1>
	{#each examples as example (example.title)}
		<section>
			<h2>{example.title}</h2>
			<SchemaDiagram diagram={example.diagram} />
		</section>
	{/each}
	<section class="narrow">
		<h2>narrow container (scaled)</h2>
		<SchemaDiagram diagram={examples[0]!.diagram} />
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: ui-sans-serif, system-ui, sans-serif;
		background: var(--background, #fff);
		color: var(--foreground, #0f172a);
	}
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px;
	}
	section {
		margin: 32px 0;
		padding: 16px;
		border: 1px dashed #cbd5e1;
		border-radius: 8px;
	}
	h2 {
		font-size: 14px;
		font-weight: 500;
		color: #64748b;
		margin: 0 0 12px;
	}
	.narrow {
		max-width: 480px;
	}
</style>

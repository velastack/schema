<script lang="ts">
	/**
	 * One collection as a card: name, then one row per field. The same card
	 * is drawn by the server-rendered diagram and by the editor's canvas, so
	 * its metrics come from the engine's layout constants and its colours
	 * from the host's shadcn tokens, with fallbacks.
	 */
	import {
		CARD_HEADER,
		CARD_PADDING,
		CARD_ROW,
		CARD_WIDTH,
		type DiagramCollection,
		type DiagramField,
		type Field
	} from '@velastack/schema';

	interface Props {
		entry: DiagramCollection;
		/** Collection names by id, to label relation rows with their target. */
		names?: Record<string, string>;
		class?: string;
		style?: string;
	}

	let { entry, names = {}, class: className = '', style = '' }: Props = $props();

	const typeLabel = (field: Field): string => {
		let label: string = field.type;
		if (field.type === 'relation') label = names[field.collectionId] ?? 'relation';
		if (field.type === 'geoPoint') label = 'geo';
		const multiple =
			(field.type === 'select' || field.type === 'file' || field.type === 'relation') &&
			(field.maxSelect ?? 1) >= 2;
		return multiple ? `${label}[]` : label;
	};

	const rowTitle = (row: DiagramField): string => {
		const parts: string[] = [];
		if (row.status === 'renamed' && row.previousName) parts.push(`was ${row.previousName}`);
		if (row.status === 'replaced' && row.previousType) parts.push(`was ${row.previousType}`);
		if (row.field.required) parts.push('required');
		if (row.field.type === 'relation' && row.field.cascadeDelete) parts.push('cascade delete');
		if (row.field.system) parts.push('system field');
		return parts.join(', ');
	};

	const kind = $derived(entry.collection.type === 'base' ? '' : entry.collection.type);
</script>

<div
	class="table-card {className}"
	data-status={entry.status}
	data-locked={entry.locked || undefined}
	style="--card-width: {CARD_WIDTH}px; --card-header: {CARD_HEADER}px; --card-row: {CARD_ROW}px; --card-padding: {CARD_PADDING}px; {style}"
>
	<header class="table-card__header">
		{#if entry.previousName}
			<s class="table-card__previous">{entry.previousName}</s>
		{/if}
		<span class="table-card__name">{entry.collection.name}</span>
		{#if kind}
			<span class="table-card__kind">{kind}</span>
		{/if}
		{#if entry.locked}
			<svg class="table-card__lock" viewBox="0 0 16 16" aria-label="locked" role="img">
				<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
				<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" />
			</svg>
		{/if}
	</header>
	<ul class="table-card__rows">
		{#each entry.fields as row (row.field.id)}
			<li
				class="table-card__row"
				data-status={row.status}
				data-system={row.field.system || undefined}
				title={rowTitle(row)}
			>
				<span class="table-card__field">
					{#if row.status === 'renamed' && row.previousName}
						<s>{row.previousName}</s>
					{/if}
					{row.field.name}{#if row.field.required}<span class="table-card__required">*</span
						>{/if}
				</span>
				<span class="table-card__type">
					{#if row.status === 'replaced' && row.previousType}
						<s>{row.previousType}</s>
					{/if}
					{typeLabel(row.field)}
				</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.table-card {
		box-sizing: border-box;
		width: var(--card-width);
		padding-bottom: var(--card-padding);
		font: 12px/1 ui-sans-serif, system-ui, sans-serif;
		color: var(--foreground, #0f172a);
		background: var(--card, var(--background, #fff));
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 6px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
		--status: var(--muted-foreground, #64748b);
		--added: var(--green, #00a85a);
		--removed: var(--danger, #d1242f);
		--changed: var(--warning, #bf8700);
	}
	.table-card[data-status='created'] {
		border-color: color-mix(in oklab, var(--added) 55%, var(--border, #e2e8f0));
	}
	.table-card[data-status='dropped'] {
		border-style: dashed;
		border-color: color-mix(in oklab, var(--removed) 55%, var(--border, #e2e8f0));
		opacity: 0.8;
	}
	.table-card[data-status='changed'] {
		border-color: color-mix(in oklab, var(--changed) 45%, var(--border, #e2e8f0));
	}

	.table-card__header {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 6px;
		height: var(--card-header);
		padding: 0 10px;
		border-bottom: 1px solid var(--border, #e2e8f0);
		font-weight: 600;
		font-size: 13px;
	}
	.table-card[data-status='created'] .table-card__header {
		color: var(--added);
	}
	.table-card[data-status='dropped'] .table-card__header .table-card__name {
		text-decoration: line-through;
		color: var(--removed);
	}
	.table-card__name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.table-card__previous {
		color: var(--muted-foreground, #64748b);
		font-weight: 400;
	}
	.table-card__kind {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground, #64748b);
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 999px;
		padding: 2px 6px;
	}
	.table-card__lock {
		width: 12px;
		height: 12px;
		fill: var(--muted-foreground, #64748b);
		stroke: var(--muted-foreground, #64748b);
		stroke-width: 1.5;
		flex: none;
	}

	.table-card__rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.table-card__row {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		height: var(--card-row);
		padding: 0 10px;
		border-left: 2px solid transparent;
	}
	.table-card__row[data-status='added'] {
		border-left-color: var(--added);
		background: color-mix(in oklab, var(--added) 8%, transparent);
	}
	.table-card__row[data-status='removed'] {
		border-left-color: var(--removed);
		background: color-mix(in oklab, var(--removed) 8%, transparent);
		color: var(--muted-foreground, #64748b);
	}
	.table-card__row[data-status='removed'] .table-card__field,
	.table-card__row[data-status='removed'] .table-card__type {
		text-decoration: line-through;
	}
	.table-card__row[data-status='renamed'],
	.table-card__row[data-status='changed'],
	.table-card__row[data-status='replaced'] {
		border-left-color: var(--changed);
		background: color-mix(in oklab, var(--changed) 8%, transparent);
	}
	/* A created or dropped card says so as a whole; its rows stay quiet. */
	.table-card[data-status='created'] .table-card__row,
	.table-card[data-status='dropped'] .table-card__row {
		border-left-color: transparent;
		background: none;
	}
	.table-card__row[data-system] {
		color: var(--muted-foreground, #64748b);
	}
	.table-card__field {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.table-card__field s,
	.table-card__type s {
		color: var(--muted-foreground, #64748b);
		margin-right: 4px;
	}
	.table-card__required {
		color: var(--muted-foreground, #64748b);
		margin-left: 1px;
	}
	.table-card__type {
		flex: none;
		color: var(--muted-foreground, #64748b);
		font-family: var(--font-code, ui-monospace, monospace);
		font-size: 11px;
	}
	.table-card__row[title=''] {
		cursor: default;
	}
</style>

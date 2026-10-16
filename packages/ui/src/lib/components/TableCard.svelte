<script lang="ts">
	/**
	 * One collection as a card: name, then one row per field. The same card
	 * is drawn by the server-rendered diagram (read-only) and by the editor
	 * (`editable`, with callbacks and handle snippets). Metrics come from the
	 * engine's layout constants, colours from the host's shadcn tokens with
	 * fallbacks.
	 */
	import type { Snippet } from 'svelte';
	import {
		CARD_HEADER,
		CARD_PADDING,
		CARD_ROW,
		CARD_WIDTH,
		FIELD_TYPES,
		type DiagramCollection,
		type DiagramField,
		type Field,
		type Issue
	} from '@velastack/schema';
	import type { TypeChoice } from '../editor.svelte.js';
	import FieldOptions from './editor/FieldOptions.svelte';

	interface Props {
		entry: DiagramCollection;
		/** Collection names by id, to label relation rows with their target. */
		names?: Record<string, string>;
		class?: string;
		style?: string;
		editable?: boolean;
		/** Collections a relation may point at, for the type menu. */
		targets?: { id: string; name: string }[];
		issues?: Issue[];
		selected?: boolean;
		onselect?: (fieldId?: string) => void;
		onrename?: (name: string) => void;
		onremove?: () => void;
		onrestore?: () => void;
		onfieldadd?: (name: string) => void;
		onfieldrename?: (fieldId: string, name: string) => void;
		onfieldtype?: (fieldId: string, choice: TypeChoice) => void;
		onfieldupdate?: (fieldId: string, patch: Partial<Field>) => void;
		onfieldremove?: (fieldId: string) => void;
		onfieldrestore?: (fieldId: string) => void;
		/** Take focus in the name input once (a table that was just created). */
		focusName?: boolean;
		onfocusedname?: () => void;
		/** Rendered at the start and end of every row (the editor puts connection handles here). */
		rowStart?: Snippet<[DiagramField]>;
		rowEnd?: Snippet<[DiagramField]>;
		headerEnd?: Snippet;
	}

	let {
		entry,
		names = {},
		class: className = '',
		style = '',
		editable = false,
		targets = [],
		issues = [],
		selected = false,
		onselect,
		onrename,
		onremove,
		onrestore,
		onfieldadd,
		onfieldrename,
		onfieldtype,
		onfieldupdate,
		onfieldremove,
		onfieldrestore,
		focusName = false,
		onfocusedname,
		rowStart,
		rowEnd,
		headerEnd
	}: Props = $props();

	let newField = $state('');
	let optionsFor = $state<string | null>(null);
	let nameInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (focusName && nameInput) {
			nameInput.focus();
			nameInput.select();
			onfocusedname?.();
		}
	});

	const multiple = (field: Field) =>
		(field.type === 'select' || field.type === 'file' || field.type === 'relation') &&
		(field.maxSelect ?? 1) >= 2;

	const typeLabel = (field: Field): string => {
		let label: string = field.type;
		if (field.type === 'relation') label = names[field.collectionId] ?? 'relation';
		if (field.type === 'geoPoint') label = 'geo';
		return multiple(field) ? `${label}[]` : label;
	};

	/** The type menu's value for a field: `relation:<target>` or the type. */
	const choiceValue = (field: Field): string =>
		field.type === 'relation' ? `relation:${field.collectionId}` : field.type;

	const parseChoice = (value: string): TypeChoice =>
		value.startsWith('relation:')
			? { type: 'relation', target: value.slice('relation:'.length) }
			: { type: value as Exclude<Field['type'], 'relation'> };

	const rowTitle = (row: DiagramField): string => {
		const parts: string[] = [];
		if (row.status === 'renamed' && row.previousName) parts.push(`was ${row.previousName}`);
		if (row.status === 'replaced' && row.previousType) parts.push(`was ${row.previousType}`);
		if (row.field.required) parts.push('required');
		if (row.field.type === 'relation' && row.field.cascadeDelete) parts.push('cascade delete');
		if (row.field.system) parts.push('system field');
		return parts.join(', ');
	};

	const fieldIssues = (fieldId: string) => issues.filter((i) => i.fieldId === fieldId);
	const collectionIssues = $derived(issues.filter((i) => !i.fieldId));
	const worst = (list: Issue[]) =>
		list.some((i) => i.level === 'error') ? 'error' : list.some((i) => i.level === 'warning') ? 'warning' : list.length ? 'info' : '';

	const kind = $derived(entry.collection.type === 'base' ? '' : entry.collection.type);
	const canEdit = $derived(editable && !entry.locked && entry.status !== 'dropped');
	const plainTypes = FIELD_TYPES.filter((t) => t !== 'relation');

	const submitRename = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		onrename?.(input.value);
		input.value = entry.collection.name;
	};
	const submitField = (event: Event, row: DiagramField) => {
		const input = event.currentTarget as HTMLInputElement;
		onfieldrename?.(row.field.id, input.value);
		input.value = row.field.name;
	};
	const blurOnEnter = (event: KeyboardEvent) => {
		if (event.key === 'Enter' || event.key === 'Escape') (event.currentTarget as HTMLElement).blur();
	};
</script>

<div
	class="table-card {className}"
	data-status={entry.status}
	data-locked={entry.locked || undefined}
	data-editable={canEdit || undefined}
	data-selected={selected || undefined}
	data-issue={worst(issues) || undefined}
	style="--card-width: {CARD_WIDTH}px; --card-header: {CARD_HEADER}px; --card-row: {CARD_ROW}px; --card-padding: {CARD_PADDING}px; {style}"
	role={editable ? 'group' : undefined}
	onpointerdown={() => onselect?.()}
>
	<header class="table-card__header">
		{#if entry.previousName}
			<s class="table-card__previous">{entry.previousName}</s>
		{/if}
		{#if canEdit}
			<input
				class="table-card__name table-card__input nodrag"
				bind:this={nameInput}
				value={entry.collection.name}
				spellcheck="false"
				aria-label="Collection name"
				onchange={submitRename}
				onkeydown={blurOnEnter}
			/>
		{:else}
			<span class="table-card__name">{entry.collection.name}</span>
		{/if}
		{#if kind}
			<span class="table-card__kind">{kind}</span>
		{/if}
		{#if entry.locked}
			<svg class="table-card__lock" viewBox="0 0 16 16" aria-label="locked" role="img">
				<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
				<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" />
			</svg>
		{/if}
		{#if collectionIssues.length}
			<span class="table-card__badge nodrag" data-level={worst(collectionIssues)} title={collectionIssues.map((i) => i.message).join('\n')}>!</span>
		{/if}
		{#if editable && entry.status === 'dropped'}
			<button class="table-card__action nodrag" type="button" onclick={onrestore}>restore</button>
		{:else if canEdit}
			<button class="table-card__action table-card__action--quiet nodrag" type="button" title="Delete collection" aria-label="Delete collection" onclick={onremove}>×</button>
		{/if}
		{@render headerEnd?.()}
	</header>
	<ul class="table-card__rows">
		{#each entry.fields as row (row.field.id)}
			{@const rowIssues = fieldIssues(row.field.id)}
			{@const rowEditable = canEdit && !row.field.system && row.status !== 'removed'}
			<li
				class="table-card__row"
				data-status={row.status}
				data-system={row.field.system || undefined}
				data-issue={worst(rowIssues) || undefined}
				title={rowIssues.length ? rowIssues.map((i) => i.message).join('\n') : rowTitle(row)}
				onpointerdown={(event) => {
					event.stopPropagation();
					onselect?.(row.field.id);
				}}
			>
				{@render rowStart?.(row)}
				<span class="table-card__field">
					{#if row.status === 'renamed' && row.previousName}
						<s>{row.previousName}</s>
					{/if}
					{#if rowEditable}
						<input
							class="table-card__input nodrag"
							value={row.field.name}
							spellcheck="false"
							aria-label="Field name"
							onchange={(event) => submitField(event, row)}
							onkeydown={blurOnEnter}
						/>
					{:else}
						{row.field.name}{#if row.field.required}<span class="table-card__required">*</span>{/if}
					{/if}
				</span>
				{#if rowEditable}
					<select
						class="table-card__type table-card__select nodrag"
						aria-label="Field type"
						value={choiceValue(row.field)}
						onchange={(event) => onfieldtype?.(row.field.id, parseChoice((event.currentTarget as HTMLSelectElement).value))}
					>
						{#each plainTypes as type (type)}
							<option value={type}>{type}</option>
						{/each}
						{#if targets.length}
							<optgroup label="relation to">
								{#each targets as target (target.id)}
									<option value="relation:{target.id}">→ {target.name}</option>
								{/each}
							</optgroup>
						{/if}
					</select>
					<button
						class="table-card__gear nodrag"
						type="button"
						aria-label="Field options"
						data-open={optionsFor === row.field.id || undefined}
						data-marked={row.field.required || multiple(row.field) || undefined}
						onclick={() => (optionsFor = optionsFor === row.field.id ? null : row.field.id)}
					>
						{#if row.field.required}*{:else}…{/if}
					</button>
					{#if optionsFor === row.field.id}
						<FieldOptions
							field={row.field}
							onchange={(patch) => onfieldupdate?.(row.field.id, patch)}
							onremove={() => {
								optionsFor = null;
								onfieldremove?.(row.field.id);
							}}
							onclose={() => (optionsFor = null)}
						/>
					{/if}
				{:else}
					<span class="table-card__type">
						{#if row.status === 'replaced' && row.previousType}
							<s>{row.previousType}</s>
						{/if}
						{typeLabel(row.field)}
					</span>
					{#if editable && row.status === 'removed' && entry.status !== 'dropped' && !entry.locked}
						<button class="table-card__action nodrag" type="button" onclick={() => onfieldrestore?.(row.field.id)}>restore</button>
					{/if}
				{/if}
				{@render rowEnd?.(row)}
			</li>
		{/each}
		{#if canEdit}
			<li class="table-card__row table-card__row--new">
				<input
					class="table-card__input table-card__new nodrag"
					placeholder="add field"
					spellcheck="false"
					aria-label="New field name"
					bind:value={newField}
					onkeydown={(event) => {
						if (event.key === 'Enter' && newField.trim()) {
							onfieldadd?.(newField);
							newField = '';
						}
						if (event.key === 'Escape') (event.currentTarget as HTMLInputElement).blur();
					}}
				/>
			</li>
		{/if}
	</ul>
</div>

<style>
	.table-card {
		position: relative;
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
	.table-card[data-selected] {
		box-shadow:
			0 0 0 2px var(--ring, #94a3b8),
			0 1px 2px rgb(0 0 0 / 0.04);
	}
	.table-card[data-issue='error'] {
		border-color: var(--removed);
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
	.table-card__badge {
		flex: none;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 700;
		line-height: 14px;
		text-align: center;
		color: #fff;
		background: var(--changed);
	}
	.table-card__badge[data-level='error'] {
		background: var(--removed);
	}
	.table-card__badge[data-level='info'] {
		background: var(--muted-foreground, #64748b);
	}

	.table-card__rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.table-card__row {
		position: relative;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
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
	.table-card__row[data-issue='error'] {
		border-left-color: var(--removed);
		background: color-mix(in oklab, var(--removed) 10%, transparent);
	}
	.table-card__row[data-system] {
		color: var(--muted-foreground, #64748b);
	}
	.table-card__field {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 4px;
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
		max-width: 50%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted-foreground, #64748b);
		font-family: var(--font-code, ui-monospace, monospace);
		font-size: 11px;
	}

	/* Editing controls look like text until focused. */
	.table-card__input,
	.table-card__select {
		font: inherit;
		color: inherit;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		padding: 2px 4px;
		margin: 0 -4px;
		min-width: 0;
		outline: none;
	}
	.table-card__input {
		width: 100%;
	}
	.table-card__input:hover,
	.table-card__select:hover {
		border-color: var(--border, #e2e8f0);
	}
	.table-card__input:focus,
	.table-card__select:focus {
		border-color: var(--ring, #94a3b8);
		background: var(--background, #fff);
	}
	.table-card__select {
		appearance: none;
		-webkit-appearance: none;
		text-align: right;
		cursor: pointer;
		max-width: 48%;
	}
	.table-card__new {
		color: var(--muted-foreground, #64748b);
	}
	.table-card__new::placeholder {
		color: color-mix(in oklab, var(--muted-foreground, #64748b) 60%, transparent);
	}
	.table-card__row--new {
		border-top: 1px dashed var(--border, #e2e8f0);
	}
	.table-card__gear {
		flex: none;
		width: 16px;
		height: 16px;
		padding: 0;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: var(--muted-foreground, #64748b);
		font: inherit;
		line-height: 16px;
		cursor: pointer;
		opacity: 0;
	}
	.table-card__row:hover .table-card__gear,
	.table-card__gear[data-open],
	.table-card__gear[data-marked] {
		opacity: 1;
	}
	.table-card__gear:hover,
	.table-card__gear[data-open] {
		background: var(--muted, #f1f5f9);
		color: var(--foreground, #0f172a);
	}
	.table-card__action {
		flex: none;
		font: inherit;
		font-size: 11px;
		color: var(--muted-foreground, #64748b);
		background: transparent;
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 3px;
		padding: 1px 6px;
		cursor: pointer;
	}
	.table-card__action:hover {
		color: var(--foreground, #0f172a);
		border-color: var(--ring, #94a3b8);
	}
	.table-card__action--quiet {
		border-color: transparent;
		padding: 0 4px;
		font-size: 14px;
		line-height: 1;
		opacity: 0;
	}
	.table-card:hover .table-card__action--quiet {
		opacity: 1;
	}
</style>

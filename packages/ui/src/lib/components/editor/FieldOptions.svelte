<script lang="ts">
	/**
	 * The one popover a field gets: required, single or many where that
	 * applies, the options a type cannot do without, and remove. It closes on
	 * Escape or a click outside. Nothing nests further.
	 */
	import type { Field } from '@velastack/schema';

	interface Props {
		field: Field;
		onchange: (patch: Partial<Field>) => void;
		onremove: () => void;
		onclose: () => void;
	}

	let { field, onchange, onremove, onclose }: Props = $props();

	let panel: HTMLDivElement | undefined = $state();

	$effect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (panel && !panel.contains(event.target as Node)) onclose();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onclose();
		};
		// Deferred so the click that opened the panel does not also close it.
		const id = setTimeout(() => {
			document.addEventListener('pointerdown', onPointerDown, true);
			document.addEventListener('keydown', onKey);
		});
		return () => {
			clearTimeout(id);
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKey);
		};
	});

	const canBeMultiple = $derived(
		field.type === 'select' || field.type === 'file' || field.type === 'relation'
	);
	const isMultiple = $derived(
		(field.type === 'select' || field.type === 'file' || field.type === 'relation') &&
			(field.maxSelect ?? 1) >= 2
	);
	const values = $derived(field.type === 'select' ? field.values.join(', ') : '');

	const setValues = (text: string) => {
		const list = text
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean);
		onchange({ values: list } as Partial<Field>);
	};
</script>

<div class="field-options nodrag nowheel" bind:this={panel} role="dialog" aria-label="Field options">
	<label class="field-options__row">
		<input type="checkbox" checked={field.required ?? false} onchange={(e) => onchange({ required: (e.currentTarget as HTMLInputElement).checked })} />
		required
	</label>
	{#if canBeMultiple}
		<label class="field-options__row">
			<input type="checkbox" checked={isMultiple} onchange={(e) => onchange({ maxSelect: (e.currentTarget as HTMLInputElement).checked ? 999 : 1 } as Partial<Field>)} />
			many
		</label>
	{/if}
	{#if field.type === 'relation'}
		<label class="field-options__row">
			<input type="checkbox" checked={field.cascadeDelete ?? false} onchange={(e) => onchange({ cascadeDelete: (e.currentTarget as HTMLInputElement).checked } as Partial<Field>)} />
			delete with target
		</label>
	{/if}
	{#if field.type === 'select'}
		<label class="field-options__row field-options__row--stack">
			options, comma separated
			<input class="field-options__text" value={values} placeholder="draft, published" onchange={(e) => setValues((e.currentTarget as HTMLInputElement).value)} />
		</label>
	{/if}
	{#if field.type === 'autodate'}
		<label class="field-options__row">
			<input type="checkbox" checked={field.onCreate ?? false} onchange={(e) => onchange({ onCreate: (e.currentTarget as HTMLInputElement).checked } as Partial<Field>)} />
			set on create
		</label>
		<label class="field-options__row">
			<input type="checkbox" checked={field.onUpdate ?? false} onchange={(e) => onchange({ onUpdate: (e.currentTarget as HTMLInputElement).checked } as Partial<Field>)} />
			set on update
		</label>
	{/if}
	<label class="field-options__row">
		<input type="checkbox" checked={field.hidden ?? false} onchange={(e) => onchange({ hidden: (e.currentTarget as HTMLInputElement).checked })} />
		hidden from the API
	</label>
	<button class="field-options__remove" type="button" onclick={onremove}>remove field</button>
</div>

<style>
	.field-options {
		position: absolute;
		top: calc(100% + 4px);
		right: 8px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 170px;
		padding: 8px 10px;
		font: 12px/1.2 ui-sans-serif, system-ui, sans-serif;
		color: var(--foreground, #0f172a);
		background: var(--popover, var(--background, #fff));
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
	}
	.field-options__row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.field-options__row--stack {
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		color: var(--muted-foreground, #64748b);
	}
	.field-options__text {
		font: inherit;
		color: var(--foreground, #0f172a);
		background: var(--background, #fff);
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 3px;
		padding: 3px 6px;
	}
	.field-options__remove {
		margin-top: 2px;
		padding: 3px 6px;
		font: inherit;
		color: var(--danger, #d1242f);
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		text-align: left;
		cursor: pointer;
	}
	.field-options__remove:hover {
		border-color: var(--danger, #d1242f);
	}
</style>

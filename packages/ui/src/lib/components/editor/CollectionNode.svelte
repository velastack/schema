<script lang="ts">
	/**
	 * A collection on the SvelteFlow canvas: the shared TableCard, bound to
	 * the editor state through context, with a connection handle at either
	 * end of every row and at both ends of the header.
	 */
	import { getContext } from 'svelte';
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import type { DiagramField } from '@velastack/schema';
	import TableCard from '../TableCard.svelte';
	import { EDITOR_CONTEXT, type EditorState } from '../../editor.svelte.js';

	let { data, selected }: NodeProps & { data: { collectionId: string } } = $props();

	const editor = getContext<EditorState>(EDITOR_CONTEXT);
	const id = $derived(data.collectionId);
	const entry = $derived(editor.diagram.collections.find((c) => c.collection.id === id));
	const targets = $derived(
		editor.next.collections
			.filter((c) => c.type !== 'view')
			.map((c) => ({ id: c.id, name: c.name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const connectable = $derived(Boolean(entry) && !entry!.locked && entry!.status !== 'dropped');
</script>

{#snippet rowStart(row: DiagramField)}
	{#if connectable && !row.field.system && row.status !== 'removed'}
		<Handle type="source" position={Position.Left} id="{row.field.id}:l" class="collection-node__handle collection-node__handle--left" />
	{/if}
{/snippet}

{#snippet rowEnd(row: DiagramField)}
	{#if connectable && !row.field.system && row.status !== 'removed'}
		<Handle type="source" position={Position.Right} id="{row.field.id}:r" class="collection-node__handle collection-node__handle--right" />
	{/if}
{/snippet}

{#snippet headerEnd()}
	<Handle type="target" position={Position.Left} id="in:l" class="collection-node__handle collection-node__handle--target" />
	<Handle type="target" position={Position.Right} id="in:r" class="collection-node__handle collection-node__handle--target" />
{/snippet}

{#if entry}
	<TableCard
		{entry}
		names={editor.diagram.names}
		editable
		{targets}
		issues={editor.issuesFor(id)}
		{selected}
		onselect={(fieldId) => (editor.selection = fieldId ? { collectionId: id, fieldId } : { collectionId: id })}
		onrename={(name) => editor.renameCollection(id, name)}
		onremove={() => editor.removeCollection(id)}
		onrestore={() => editor.restoreCollection(id)}
		onfieldadd={(name) => editor.addField(id, name)}
		onfieldrename={(fieldId, name) => editor.renameField(id, fieldId, name)}
		onfieldtype={(fieldId, choice) => editor.setFieldType(id, fieldId, choice)}
		onfieldupdate={(fieldId, patch) => editor.updateField(id, fieldId, patch)}
		onfieldremove={(fieldId) => editor.removeField(id, fieldId)}
		onfieldrestore={(fieldId) => editor.restoreField(id, fieldId)}
		focusName={editor.focusName === id}
		onfocusedname={() => (editor.focusName = null)}
		{rowStart}
		{rowEnd}
		{headerEnd}
	/>
{/if}

<style>
	:global(.svelte-flow .collection-node__handle) {
		width: 8px;
		height: 8px;
		border: 1px solid var(--muted-foreground, #64748b);
		background: var(--background, #fff);
		opacity: 0;
		transition: opacity 120ms;
	}
	:global(.svelte-flow .table-card__row:hover .collection-node__handle),
	:global(.svelte-flow .collection-node__handle:hover),
	:global(.svelte-flow.connecting .collection-node__handle--target) {
		opacity: 1;
	}
	:global(.svelte-flow .collection-node__handle--target) {
		top: 18px;
	}
</style>

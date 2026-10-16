<script lang="ts">
	/**
	 * The canvas inside the SvelteFlow provider: maps editor state onto nodes
	 * and edges, routes canvas events back into it, and hosts the dock. Lives
	 * below the provider so `useSvelteFlow` runs during component setup.
	 */
	import { untrack } from 'svelte';
	import {
		Background,
		ConnectionMode,
		SvelteFlow,
		useSvelteFlow,
		type Connection,
		type Edge,
		type Node
	} from '@xyflow/svelte';
	import type { EditorState } from '../../editor.svelte.js';
	import type { SchemaApi } from '../../api.js';
	import CollectionNode from './CollectionNode.svelte';
	import RelationEdge from './RelationEdge.svelte';
	import Dock from './Dock.svelte';

	interface Props {
		editor: EditorState;
		api: SchemaApi;
		colorMode: 'light' | 'dark' | 'system';
	}

	let { editor, api, colorMode }: Props = $props();

	const flow = useSvelteFlow();
	const nodeTypes = { collection: CollectionNode };
	const edgeTypes = { relation: RelationEdge };

	// Owned here, not derived: SvelteFlow writes positions and measurements
	// into these arrays while a drag is in progress.
	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);

	// System and plugin collections are PocketBase's business: locked, and
	// kept off the canvas so the user's own tables have the room.
	const shown = $derived(editor.diagram.collections.filter((c) => !c.locked));
	const shownIds = $derived(new Set(shown.map((c) => c.collection.id)));

	$effect(() => {
		const ids = shown.map((c) => c.collection.id);
		const positions = editor.positions;
		const selected = editor.selection?.collectionId;
		// Previous nodes are read untracked: this effect writes `nodes`, and
		// SvelteFlow writes measurements into them, neither of which should
		// run it again.
		const previous = untrack(() => nodes);
		nodes = ids.map((id) => {
			const existing = previous.find((n) => n.id === id);
			return {
				id,
				type: 'collection',
				position: positions[id] ?? existing?.position ?? { x: 0, y: 0 },
				data: { collectionId: id },
				selected: id === selected,
				...(existing?.measured ? { measured: existing.measured } : {})
			};
		});
	});

	$effect(() => {
		const positions = editor.positions;
		edges = editor.diagram.edges
			.filter((edge) => shownIds.has(edge.from) && shownIds.has(edge.to))
			.map((edge) => {
			const from = positions[edge.from] ?? { x: 0, y: 0 };
			const to = positions[edge.to] ?? { x: 0, y: 0 };
			const self = edge.from === edge.to;
			const rightwards = self ? true : to.x >= from.x;
			return {
				id: `${edge.from}:${edge.fieldId}`,
				source: edge.from,
				sourceHandle: `${edge.fieldId}:${rightwards ? 'r' : 'l'}`,
				target: edge.to,
				targetHandle: self || !rightwards ? 'in:r' : 'in:l',
				type: 'relation',
				selectable: false,
				data: { status: edge.status, multiple: edge.multiple, cascade: edge.cascade }
			};
			});
	});

	const onconnect = (connection: Connection) => {
		if (!connection.sourceHandle) return;
		const fieldId = connection.sourceHandle.replace(/:[lr]$/, '');
		editor.connect(connection.source, fieldId, connection.target);
	};

	const addTable = () => {
		// A new table lands in the middle of what the user is looking at.
		const centre = flow.screenToFlowPosition({
			x: window.innerWidth / 2,
			y: window.innerHeight / 2 - 60
		});
		editor.addCollection({ x: centre.x - 120, y: centre.y - 40 });
	};
</script>

<div class="schema-editor">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{edgeTypes}
		{colorMode}
		connectionMode={ConnectionMode.Strict}
		fitView
		fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
		minZoom={0.2}
		maxZoom={1.5}
		deleteKey={null}
		nodesConnectable
		elevateNodesOnSelect
		proOptions={{ hideAttribution: true }}
		{onconnect}
		onnodedragstop={({ targetNode }) => {
			if (targetNode) editor.setPosition(targetNode.id, { ...targetNode.position });
		}}
		onnodeclick={({ node }) => (editor.selection = { collectionId: node.id })}
		onpaneclick={() => (editor.selection = null)}
	>
		<Background gap={24} />
	</SvelteFlow>
	<Dock {editor} {api} onaddtable={addTable} />
</div>

<style>
	.schema-editor {
		position: relative;
		width: 100%;
		height: 100%;
		background: var(--muted, #f8fafc);
	}
	.schema-editor :global(.svelte-flow) {
		background: transparent;
	}
	.schema-editor :global(.svelte-flow__node) {
		font: inherit;
	}
	.schema-editor :global(.svelte-flow__node.selected .table-card) {
		box-shadow:
			0 0 0 2px var(--ring, #94a3b8),
			0 1px 2px rgb(0 0 0 / 0.04);
	}
	.schema-editor :global(.svelte-flow__connectionline) {
		stroke: var(--ring, #94a3b8);
		stroke-width: 1.25;
	}
</style>

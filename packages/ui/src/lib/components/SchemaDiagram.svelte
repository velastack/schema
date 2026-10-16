<script lang="ts">
	/**
	 * A read-only diagram: cards placed by the engine's layout, relation
	 * lines in an SVG underneath. Renders completely on the server; the only
	 * client-side work is scaling the canvas down to fit its container,
	 * which falls back to horizontal scrolling without JavaScript.
	 */
	import {
		diagramSchema,
		layout as computeLayout,
		type Diagram,
		type Direction,
		type Layout
	} from '@velastack/schema';
	import TableCard from './TableCard.svelte';
	import { edgePaths } from '../edges.js';

	interface Props {
		diagram: Diagram;
		/** Precomputed positions; computed from the diagram when omitted. */
		layout?: Layout;
		direction?: Direction;
		/** Never scale above this; 1 keeps cards at their natural size. */
		maxScale?: number;
		/** Never scale below this; a wider diagram scrolls horizontally instead of shrinking further. */
		minScale?: number;
		class?: string;
	}

	let {
		diagram,
		layout,
		direction = 'LR',
		maxScale = 1,
		minScale = 0.7,
		class: className = ''
	}: Props = $props();

	const placed = $derived(layout ?? computeLayout(diagramSchema(diagram), { direction }));
	const paths = $derived(edgePaths(diagram, placed));
	const names = $derived(diagram.names);

	let container: HTMLDivElement | undefined = $state();
	let available = $state(0);
	const scale = $derived(
		available > 0 ? Math.max(minScale, Math.min(maxScale, available / placed.width)) : 1
	);
	const scrolls = $derived(available > 0 && placed.width * scale > available + 1);

	$effect(() => {
		if (!container) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) available = entry.contentRect.width;
		});
		observer.observe(container);
		return () => observer.disconnect();
	});

	const colour = (status: string) =>
		status === 'added' ? 'var(--green, #00a85a)' : status === 'removed' ? 'var(--danger, #d1242f)' : 'var(--muted-foreground, #64748b)';
</script>

<div
	class="schema-diagram {className}"
	bind:this={container}
	data-scaled={(available > 0 && !scrolls) || undefined}
	style="--scale: {scale}; --width: {placed.width}px; --height: {placed.height}px"
>
	<div class="schema-diagram__canvas">
		<svg
			class="schema-diagram__edges"
			width={placed.width}
			height={placed.height}
			viewBox="0 0 {placed.width} {placed.height}"
			aria-hidden="true"
		>
			{#each paths as path (path.edge.from + path.edge.fieldId)}
				<g class="schema-diagram__edge" data-status={path.edge.status} style="--edge: {colour(path.edge.status)}">
					<path d={path.d} />
					{#if path.edge.multiple}
						<!-- crow's foot at the owning row: many records point at one -->
						<path
							class="schema-diagram__many"
							d="M {path.from.x} {path.from.y} l {path.direction * 10} -5 M {path.from.x} {path.from.y} l {path.direction * 10} 0 M {path.from.x} {path.from.y} l {path.direction * 10} 5"
						/>
					{:else}
						<circle cx={path.from.x} cy={path.from.y} r="2.5" />
					{/if}
					<!-- arrow into the target header -->
					<path
						class="schema-diagram__arrow"
						d="M {path.to.x} {path.to.y} l {-path.direction * 7} -4 M {path.to.x} {path.to.y} l {-path.direction * 7} 4"
					/>
				</g>
			{/each}
		</svg>
		{#each diagram.collections as entry (entry.collection.id)}
			{@const node = placed.nodes[entry.collection.id]}
			{#if node}
				<TableCard
					{entry}
					{names}
					class="schema-diagram__card"
					style="left: {node.x}px; top: {node.y}px"
				/>
			{/if}
		{/each}
	</div>
</div>

<style>
	.schema-diagram {
		position: relative;
		width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		/* Until the observer reports a width the canvas is unscaled and scrolls. */
		height: calc(var(--height) * var(--scale));
	}
	.schema-diagram[data-scaled] {
		overflow: hidden;
	}
	.schema-diagram__canvas {
		position: relative;
		width: var(--width);
		height: var(--height);
		transform: scale(var(--scale));
		transform-origin: top left;
	}
	.schema-diagram__edges {
		position: absolute;
		inset: 0;
		overflow: visible;
	}
	.schema-diagram__edge {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.25;
	}
	.schema-diagram__edge circle {
		fill: var(--edge);
		stroke: none;
	}
	.schema-diagram__edge[data-status='removed'] {
		stroke-dasharray: 4 3;
	}
	.schema-diagram__many,
	.schema-diagram__arrow {
		stroke-linecap: round;
	}
	.schema-diagram :global(.schema-diagram__card) {
		position: absolute;
	}
</style>

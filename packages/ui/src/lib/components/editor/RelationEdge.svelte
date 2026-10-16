<script lang="ts">
	/**
	 * A relation line on the editor canvas: the same look as the static
	 * diagram (status colour, dot or crow's foot at the owning row, arrow at
	 * the target header), positioned by SvelteFlow from the row and header
	 * handles.
	 */
	import { BaseEdge, getBezierPath, Position, type EdgeProps } from '@xyflow/svelte';
	import type { EdgeStatus } from '@velastack/schema';

	type Data = { status: EdgeStatus; multiple: boolean; cascade: boolean };

	let {
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
		data,
		selected
	}: EdgeProps & { data?: Data } = $props();

	const status = $derived(data?.status ?? 'unchanged');
	const colour = $derived(
		status === 'added'
			? 'var(--green, #00a85a)'
			: status === 'removed'
				? 'var(--danger, #d1242f)'
				: 'var(--muted-foreground, #64748b)'
	);
	const path = $derived(
		getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0]
	);
	// Which way the line leaves its row and arrives at the header.
	const out = $derived(sourcePosition === Position.Left ? -1 : 1);
	const into = $derived(targetPosition === Position.Left ? 1 : -1);
</script>

<BaseEdge {path} style="stroke: {colour}; stroke-width: {selected ? 2 : 1.25}; {status === 'removed' ? 'stroke-dasharray: 4 3;' : ''}" />
<g class="relation-edge" style="--edge: {colour}">
	{#if data?.multiple}
		<path
			d="M {sourceX} {sourceY} l {out * 10} -5 M {sourceX} {sourceY} l {out * 10} 0 M {sourceX} {sourceY} l {out * 10} 5"
		/>
	{:else}
		<circle cx={sourceX} cy={sourceY} r="2.5" />
	{/if}
	<path d="M {targetX} {targetY} l {-into * 7} -4 M {targetX} {targetY} l {-into * 7} 4" />
</g>

<style>
	.relation-edge {
		fill: none;
		stroke: var(--edge);
		stroke-width: 1.25;
		stroke-linecap: round;
		pointer-events: none;
	}
	.relation-edge circle {
		fill: var(--edge);
		stroke: none;
	}
</style>

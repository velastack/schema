/**
 * Automatic layout with dagre: a left-to-right layered graph where an edge
 * runs from the collection that owns the relation to the one it points at.
 * The same function serves the server-rendered SVG and the editor's initial
 * positions, so both draw the same picture.
 */

import dagre from '@dagrejs/dagre';
import { relationEdges, type Collection, type Schema } from './types.js';

export type Direction = 'LR' | 'RL' | 'TB' | 'BT';

export interface Size {
	width: number;
	height: number;
}

export interface LayoutOptions {
	direction?: Direction;
	/** Pixels between nodes in the same rank. */
	nodesep?: number;
	/** Pixels between ranks. */
	ranksep?: number;
	/** How big each collection card will be drawn. */
	nodeSize?: (collection: Collection) => Size;
	/** Pixels of padding around the whole diagram. */
	margin?: number;
}

export interface Placed extends Size {
	id: string;
	x: number;
	y: number;
}

export interface Layout {
	nodes: Record<string, Placed>;
	width: number;
	height: number;
}

/** Card metrics shared with the UI package. */
export const CARD_WIDTH = 240;
export const CARD_HEADER = 36;
export const CARD_ROW = 26;
export const CARD_PADDING = 6;

export const defaultNodeSize = (collection: Collection): Size => ({
	width: CARD_WIDTH,
	height: CARD_HEADER + collection.fields.length * CARD_ROW + CARD_PADDING
});

export const layout = (schema: Schema, options: LayoutOptions = {}): Layout => {
	const direction = options.direction ?? 'LR';
	const nodeSize = options.nodeSize ?? defaultNodeSize;
	const margin = options.margin ?? 24;

	const graph = new dagre.graphlib.Graph();
	graph.setGraph({
		rankdir: direction,
		nodesep: options.nodesep ?? 48,
		ranksep: options.ranksep ?? 96,
		marginx: margin,
		marginy: margin
	});
	graph.setDefaultEdgeLabel(() => ({}));

	for (const collection of schema.collections) {
		graph.setNode(collection.id, nodeSize(collection));
	}
	const seen = new Set<string>();
	for (const edge of relationEdges(schema)) {
		if (edge.collectionId === edge.targetId) continue;
		if (!graph.hasNode(edge.targetId)) continue;
		const key = `${edge.collectionId}->${edge.targetId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		graph.setEdge(edge.collectionId, edge.targetId);
	}

	dagre.layout(graph);

	const nodes: Record<string, Placed> = {};
	let width = 0;
	let height = 0;
	for (const collection of schema.collections) {
		const node = graph.node(collection.id);
		const placed: Placed = {
			id: collection.id,
			width: node.width,
			height: node.height,
			// dagre reports centres; cards are drawn from their top-left corner.
			x: node.x - node.width / 2,
			y: node.y - node.height / 2
		};
		nodes[collection.id] = placed;
		width = Math.max(width, placed.x + placed.width + margin);
		height = Math.max(height, placed.y + placed.height + margin);
	}

	return { nodes, width, height };
};

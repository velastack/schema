/**
 * Edge geometry: where a relation line leaves its field row and where it
 * arrives at the target card, and the path between them. Shared by the SVG
 * diagram and (later) the editor's custom edges.
 */

import {
	CARD_HEADER,
	CARD_ROW,
	type Diagram,
	type DiagramEdge,
	type Layout,
	type Placed
} from '@velastack/schema';

export interface Point {
	x: number;
	y: number;
}

export interface EdgePath {
	edge: DiagramEdge;
	/** Where the line leaves the owning field's row. */
	from: Point;
	/** Where it arrives at the target card. */
	to: Point;
	/** -1 when the line leaves the card to the left, 1 to the right. */
	direction: -1 | 1;
	d: string;
}

const rowCentre = (node: Placed, index: number): number =>
	node.y + CARD_HEADER + index * CARD_ROW + CARD_ROW / 2;

/**
 * A relation leaves its row on the side facing the target and lands on the
 * target's header on the side facing back. A self-relation loops out of the
 * right side and back into the header.
 */
export const edgePath = (
	diagram: Diagram,
	layout: Layout,
	edge: DiagramEdge
): EdgePath | undefined => {
	const source = layout.nodes[edge.from];
	const target = layout.nodes[edge.to];
	if (!source || !target) return undefined;
	const entry = diagram.collections.find((c) => c.collection.id === edge.from);
	if (!entry) return undefined;
	const rowIndex = entry.fields.findIndex((f) => f.field.id === edge.fieldId);
	if (rowIndex < 0) return undefined;

	const fromY = rowCentre(source, rowIndex);
	const toY = target.y + CARD_HEADER / 2;

	if (edge.from === edge.to) {
		const x = source.x + source.width;
		const from = { x, y: fromY };
		const to = { x, y: toY };
		const bulge = 36;
		return {
			edge,
			from,
			to,
			direction: 1,
			d: `M ${from.x} ${from.y} C ${from.x + bulge} ${from.y}, ${to.x + bulge} ${to.y}, ${to.x} ${to.y}`
		};
	}

	const sourceCentre = source.x + source.width / 2;
	const targetCentre = target.x + target.width / 2;
	const direction: -1 | 1 = targetCentre >= sourceCentre ? 1 : -1;
	const from = { x: direction === 1 ? source.x + source.width : source.x, y: fromY };
	const to = { x: direction === 1 ? target.x : target.x + target.width, y: toY };
	const gap = Math.max(40, Math.abs(to.x - from.x) / 2);
	const d = `M ${from.x} ${from.y} C ${from.x + direction * gap} ${from.y}, ${to.x - direction * gap} ${to.y}, ${to.x} ${to.y}`;
	return { edge, from, to, direction, d };
};

export const edgePaths = (diagram: Diagram, layout: Layout): EdgePath[] =>
	diagram.edges
		.map((edge) => edgePath(diagram, layout, edge))
		.filter((path): path is EdgePath => path !== undefined);

/**
 * Small graph helpers over collection ids: strongly connected components for
 * cycle detection and a stable topological order for migration planning.
 */

export interface Edge {
	from: string;
	to: string;
}

/**
 * Tarjan's strongly connected components. Returns only the components that
 * contain a cycle: more than one node, or a single node with a self-edge.
 * Each component is sorted so output is stable.
 */
export const cycles = (nodes: readonly string[], edges: readonly Edge[]): string[][] => {
	const out = new Map<string, string[]>();
	for (const node of nodes) out.set(node, []);
	const selfLoops = new Set<string>();
	for (const edge of edges) {
		if (!out.has(edge.from) || !out.has(edge.to)) continue;
		if (edge.from === edge.to) selfLoops.add(edge.from);
		out.get(edge.from)!.push(edge.to);
	}

	let index = 0;
	const indices = new Map<string, number>();
	const lowlink = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const components: string[][] = [];

	const visit = (node: string) => {
		indices.set(node, index);
		lowlink.set(node, index);
		index++;
		stack.push(node);
		onStack.add(node);
		for (const next of out.get(node) ?? []) {
			if (!indices.has(next)) {
				visit(next);
				lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!));
			} else if (onStack.has(next)) {
				lowlink.set(node, Math.min(lowlink.get(node)!, indices.get(next)!));
			}
		}
		if (lowlink.get(node) === indices.get(node)) {
			const component: string[] = [];
			let member: string;
			do {
				member = stack.pop()!;
				onStack.delete(member);
				component.push(member);
			} while (member !== node);
			if (component.length > 1 || selfLoops.has(node)) {
				components.push(component.sort());
			}
		}
	};

	for (const node of [...nodes].sort()) {
		if (!indices.has(node)) visit(node);
	}
	return components.sort((a, b) => (a[0]! < b[0]! ? -1 : 1));
};

export interface TopoResult {
	/** Nodes in an order where every edge's `to` comes before its `from`. */
	order: string[];
	/** Edges that had to be dropped to break cycles (`from` comes after `to` is not guaranteed). */
	deferred: Edge[];
}

/**
 * Kahn's algorithm, dependencies first: an edge `from → to` means `from`
 * depends on `to`, so `to` is emitted earlier. Ties break on the input order
 * of `nodes`. When only cycles remain, the smallest remaining node (by input
 * order) is emitted and its outgoing edges to not-yet-emitted nodes are
 * reported as deferred.
 */
export const topological = (nodes: readonly string[], edges: readonly Edge[]): TopoResult => {
	const rank = new Map(nodes.map((n, i) => [n, i]));
	const deps = new Map<string, Set<string>>();
	for (const node of nodes) deps.set(node, new Set());
	for (const edge of edges) {
		if (edge.from === edge.to) continue;
		if (!deps.has(edge.from) || !deps.has(edge.to)) continue;
		deps.get(edge.from)!.add(edge.to);
	}

	const order: string[] = [];
	const deferred: Edge[] = [];
	const emitted = new Set<string>();
	const remaining = new Set(nodes);

	while (remaining.size > 0) {
		const ready = [...remaining]
			.filter((n) => [...deps.get(n)!].every((d) => emitted.has(d)))
			.sort((a, b) => rank.get(a)! - rank.get(b)!);
		if (ready.length > 0) {
			for (const node of ready) {
				order.push(node);
				emitted.add(node);
				remaining.delete(node);
			}
			continue;
		}
		// Only cycles left: break the smallest one.
		const node = [...remaining].sort((a, b) => rank.get(a)! - rank.get(b)!)[0]!;
		for (const dep of deps.get(node)!) {
			if (!emitted.has(dep)) deferred.push({ from: node, to: dep });
		}
		order.push(node);
		emitted.add(node);
		remaining.delete(node);
	}

	// Self-edges are always deferred: a collection cannot point at itself
	// before it exists.
	for (const edge of edges) {
		if (edge.from === edge.to && deps.has(edge.from)) deferred.push(edge);
	}

	return { order, deferred };
};

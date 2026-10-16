# velastack-schema

A visual schema viewer and editor for PocketBase, in two packages:

- [`@velastack/schema`](packages/schema) — the engine. A canonical collection model where identity is the id, a diff that needs no rename heuristics, a lint that says what PocketBase would refuse and what it would silently lose, a four-phase migration planner that handles relation cycles, and dagre layout. Pure TypeScript, no DOM.
- `@velastack/schema-ui` — the Svelte 5 components: one table card, a server-rendered SVG diagram for documentation pages, and the SvelteFlow editor the `vela` CLI opens. Not started yet.

The engine is consumed by the pattern pages and the schema gallery on velastack.dev, and by `vela generate migration --ai`.

[PLAN.md](PLAN.md) holds the design, the verified PocketBase behaviours it depends on, and the phases.

## Development

```sh
npm install
npm test
npm run check
npm run build
```

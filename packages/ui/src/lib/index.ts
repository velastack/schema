// The read-only surface. The editor, which brings SvelteFlow with it, is
// the `@velastack/schema-ui/editor` entry.
export { default as TableCard } from './components/TableCard.svelte';
export { default as SchemaDiagram } from './components/SchemaDiagram.svelte';
export { edgePath, edgePaths, type EdgePath, type Point } from './edges.js';
export { default as SchemaEditor } from './components/SchemaEditor.svelte';
export {
	EditorState,
	EDITOR_CONTEXT,
	type Position,
	type Selection,
	type TypeChoice
} from './editor.svelte.js';
export {
	httpApi,
	memoryApi,
	ApplyRefused,
	type SchemaApi,
	type ApplyResponse,
	type AppliedStep
} from './api.js';

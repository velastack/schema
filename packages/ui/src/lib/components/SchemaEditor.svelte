<script lang="ts">
	/**
	 * The editor: a SvelteFlow canvas of collection cards with relation
	 * edges, and the dock. State lives in `EditorState`; the canvas maps it
	 * onto nodes and edges and routes events back. Wraps the SvelteFlow
	 * provider so the canvas can use its hooks.
	 */
	import { setContext } from 'svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { EDITOR_CONTEXT, type EditorState } from '../editor.svelte.js';
	import type { SchemaApi } from '../api.js';
	import EditorCanvas from './editor/EditorCanvas.svelte';

	interface Props {
		editor: EditorState;
		api: SchemaApi;
		/** `'dark'` or `'light'`; follows the system by default. */
		colorMode?: 'light' | 'dark' | 'system';
	}

	let { editor, api, colorMode = 'system' }: Props = $props();

	// The state object itself is stable; only its fields are reactive.
	// svelte-ignore state_referenced_locally
	setContext(EDITOR_CONTEXT, editor);
</script>

<SvelteFlowProvider>
	<EditorCanvas {editor} {api} {colorMode} />
</SvelteFlowProvider>

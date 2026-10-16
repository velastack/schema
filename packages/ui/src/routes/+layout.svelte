<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

<style>
	/* The tokens the components read, named as the shadcn-svelte apps that
	   embed them name theirs, so the editor looks the same standalone. */
	:global(:root) {
		--background: #ffffff;
		--foreground: #0f172a;
		--card: #ffffff;
		--popover: #ffffff;
		--primary: #0f172a;
		--primary-foreground: #ffffff;
		--muted: #f3f5f8;
		--muted-foreground: #64748b;
		--border: #e2e8f0;
		--ring: #94a3b8;
		--green: #00a85a;
		--danger: #d1242f;
		--warning: #bf8700;
		--font-code: ui-monospace, SFMono-Regular, Menlo, monospace;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--background: #0d1117;
			--foreground: #e6edf3;
			--card: #161b22;
			--popover: #161b22;
			--primary: #e6edf3;
			--primary-foreground: #0d1117;
			--muted: #161b22;
			--muted-foreground: #8b949e;
			--border: #30363d;
			--ring: #6e7681;
			--green: #3fb950;
			--danger: #f85149;
			--warning: #d29922;
		}
	}
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: var(--background);
		color: var(--foreground);
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	:global(body > div) {
		height: 100%;
	}
</style>

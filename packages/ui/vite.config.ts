import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';

export default defineConfig({
	plugins: [
		sveltekit({
			// The editor SPA the CLI serves from this package's `app/` directory.
			adapter: adapter({ pages: 'app', assets: 'app', fallback: 'index.html' }),
			compilerOptions: { runes: true }
		})
	],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});

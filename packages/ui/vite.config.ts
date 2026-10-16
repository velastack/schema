import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ fallback: '200.html' }),
			compilerOptions: { runes: true }
		})
	],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});

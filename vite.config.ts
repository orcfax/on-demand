import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { build as esbuildBundle } from 'esbuild';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * libsodium-wrappers-sumo imports `./libsodium-sumo.mjs` as a relative sibling,
 * but the file lives in the separate `libsodium-sumo` package. pnpm's strict
 * isolation means the file doesn't exist at that relative path in a clean install.
 * This plugin redirects the broken relative import to the actual package.
 */
function fixLibsodiumResolve(): Plugin {
	return {
		name: 'fix-libsodium-resolve',
		resolveId(source, importer) {
			if (source === './libsodium-sumo.mjs' && importer?.includes('libsodium-wrappers-sumo')) {
				return this.resolve('libsodium-sumo', importer, { skipSelf: true });
			}
		}
	};
}

/**
 * Pre-bundles @meshsdk/core with esbuild for the production CLIENT build.
 *
 * Why: @meshsdk/core → @cardano-sdk/* has circular class hierarchies.
 * Rollup reorders module initializations, causing "Class extends undefined".
 * esbuild handles circular deps correctly (same as Vite dev's optimizeDeps).
 * This plugin pre-bundles the package so Rollup sees a single flat module.
 */
function preBundleMeshSdk(): Plugin {
	const outfile = resolve('node_modules/.cache/meshsdk-prebundle.mjs');
	let built = false;

	return {
		name: 'pre-bundle-meshsdk',
		apply: 'build',
		enforce: 'pre',

		async buildStart() {
			if (built) return;
			mkdirSync(resolve('node_modules/.cache'), { recursive: true });

			await esbuildBundle({
				entryPoints: ['@meshsdk/core'],
				bundle: true,
				format: 'esm',
				outfile,
				platform: 'browser',
				target: 'esnext',
				// Map Node built-in names to their browser polyfill packages
				alias: {
					stream: 'stream-browserify',
					crypto: 'crypto-browserify'
				},
				external: [
					// Server-only modules — never needed in browser
					'stream/web',
					'http',
					'https',
					'url',
					'zlib',
					'net',
					'tls',
					'fs',
					'path',
					'os',
					'child_process'
					// buffer, stream, crypto, events, process, util, string_decoder,
					// assert — all bundled from polyfill packages (not external)
				],
				minify: false,
				logLevel: 'warning',
				plugins: [
					{
						name: 'fix-libsodium',
						setup(build) {
							build.onResolve({ filter: /^\.\/libsodium-sumo\.mjs$/ }, (args) => {
								if (args.importer.includes('libsodium-wrappers-sumo')) {
									return build.resolve('libsodium-sumo', {
										resolveDir: args.resolveDir,
										kind: args.kind
									});
								}
							});
						}
					}
				]
			});
			built = true;
			console.log('  ✓ Pre-bundled @meshsdk/core with esbuild');
		},

		resolveId(source, _importer, options) {
			if (source === '@meshsdk/core' && !options.ssr) {
				return outfile;
			}
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		fixLibsodiumResolve(),
		preBundleMeshSdk(),
		nodePolyfills({
			include: ['crypto', 'buffer', 'stream'],
			globals: { Buffer: true, global: true }
		})
	],
	build: {
		target: 'esnext'
	},
	ssr: {},
	optimizeDeps: {
		include: ['@meshsdk/core'],
		esbuildOptions: {
			target: 'esnext'
		}
	}
});

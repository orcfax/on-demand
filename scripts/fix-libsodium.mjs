/**
 * libsodium-wrappers-sumo@0.7.16 ESM bundle imports "./libsodium-sumo.mjs"
 * as a relative sibling, but the file lives in the separate libsodium-sumo
 * package. pnpm's strict isolation means it doesn't exist at that path.
 * This script symlinks it into place after install.
 */
import { existsSync, symlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrapperDir = resolve(
	root,
	'node_modules/.pnpm/libsodium-wrappers-sumo@0.7.16/node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm'
);
const link = resolve(wrapperDir, 'libsodium-sumo.mjs');
const target = resolve(
	root,
	'node_modules/.pnpm/libsodium-wrappers-sumo@0.7.16/node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'
);

if (!existsSync(link) && existsSync(target)) {
	symlinkSync(target, link);
	console.log('  ✓ Symlinked libsodium-sumo.mjs into libsodium-wrappers-sumo ESM dir');
} else if (existsSync(link)) {
	console.log('  ✓ libsodium-sumo.mjs symlink already exists');
} else {
	console.log('  ⚠ libsodium-sumo target not found — skipping symlink');
}

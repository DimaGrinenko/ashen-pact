import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFile, mkdir, readdir, lstat } from 'node:fs/promises';
import tailwindcss from '@tailwindcss/vite'

/** Copy an allowlist; the preserved reference public directory is never a build input. */
function ashenReleaseAssets(): Plugin {
	let config: ResolvedConfig;
	const rasterAndData = new Set(['.png', '.webp', '.jpg', '.jpeg', '.avif', '.gif', '.json', '.atlas', '.ogg', '.mp3', '.wav', '.txt', '.md']);
	const fonts = new Set(['cormorant-600.ttf', 'manrope-400.ttf', 'manrope-700.ttf', 'barlow-semicondensed-700.ttf']);
	function inside(root: string, target: string) {
		const relative = path.relative(root, target);
		if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Release asset path must stay inside its directory');
	}
	async function copyTree(source: string, destination: string, fontDirectory = false) {
		if ((await lstat(source)).isSymbolicLink()) throw new Error(`Symbolic links are not allowed in release assets: ${source}`);
		await mkdir(destination, { recursive: true });
		for (const entry of (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const from = path.join(source, entry.name), to = path.join(destination, entry.name);
			inside(source, from); inside(destination, to);
			if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in release assets: ${from}`);
			if (entry.isDirectory()) { if (!fontDirectory) await copyTree(from, to); continue; }
			if (!entry.isFile()) throw new Error(`Unsupported asset type: ${from}`);
			if (fontDirectory) {
				if (!fonts.has(entry.name) && !/\.(txt|md|license)$/i.test(entry.name)) continue;
			} else if (!rasterAndData.has(path.extname(entry.name).toLowerCase())) throw new Error(`Non-raster or unexpected release asset: ${from}`);
			await copyFile(from, to);
		}
	}
	return {
		name: 'ashen-release-assets',
		apply: 'build' as const,
		configResolved(resolved) {
			config = resolved;
			// Validate before Vite empties an output directory; never accept an outside target.
			if (path.resolve(config.root, config.build.outDir) !== path.resolve(config.root, 'dist')) throw new Error('ASHEN PACT release output must be the project dist directory');
		},
		generateBundle(_options, bundle) {
			// publicDir is intentionally disabled for builds. Make preserved CSS public
			// references relative to emitted CSS so the ZIP also works in a CDN subpath.
			for (const file of Object.values(bundle)) if (file.type === 'asset' && file.fileName.endsWith('.css')) {
				const css = typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8');
				file.source = css.replace(/url\((['"]?)\/(ashen\/|alchemist\/fonts\/)/g, (_match, quote: string, target: string) => {
					const relative = path.posix.relative(path.posix.dirname(file.fileName), target);
					return `url(${quote}${relative.endsWith('/') ? relative : `${relative}/`}`;
				});
			}
		},
		async writeBundle() {
			const out = path.resolve(config.root, config.build.outDir);
			await copyTree(path.resolve(config.root, 'public/ashen'), path.join(out, 'ashen'));
			await copyTree(path.resolve(config.root, 'public/alchemist/fonts'), path.join(out, 'alchemist/fonts'), true);
		},
	};
}

export default defineConfig(({ command }) => ({
	plugins: [react(), tailwindcss(), ashenReleaseAssets()],
	publicDir: command === 'build' ? false : 'public',
	base: './',
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('/node_modules/@esotericsoftware/')) return 'spine';
					if (id.includes('/node_modules/@pixi/')) return 'pixi';
					if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react';
				}
			}
		}
	},
	server: {
		proxy: {
			// Stake Engine RGS endpoints (https://stakeengine.github.io/math-sdk/rgs_docs/RGS/)
			'/wallet': 'http://127.0.0.1:5010',
			'/bet': 'http://127.0.0.1:5010'
		}
	},
	preview: {
		proxy: {
			'/wallet': 'http://127.0.0.1:5010',
			'/bet': 'http://127.0.0.1:5010'
		}
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@components': path.resolve(__dirname, './src/components'),
			'@store': path.resolve(__dirname, './src/store'),
			'@layout': path.resolve(__dirname, './src/layout'),
			'@config': path.resolve(__dirname, './src/config'),
			'@api': path.resolve(__dirname, './src/api')
		}
	}
}));

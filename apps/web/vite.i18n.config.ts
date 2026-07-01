import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const repoRoot = path.resolve(__dirname, "../..");
const webRoot = path.resolve(__dirname);
const generatedRoot = path.resolve(repoRoot, ".generated", "web-root-i18n");
const webNodeModules = path.resolve(webRoot, "node_modules");

const SERVER_PORT = process.env.OMP_DECK_PORT ?? "8787";
const SERVER_HOST = process.env.OMP_DECK_HOST ?? "127.0.0.1";
const WEB_PORT = Number(process.env.OMP_DECK_WEB_PORT ?? "5174");

const SERVER_HTTP = `http://${SERVER_HOST}:${SERVER_PORT}`;

export default defineConfig({
	root: generatedRoot,
	plugins: [react()],
	envPrefix: ["VITE_", "OMP_DECK_"],
	publicDir: path.resolve(generatedRoot, "public"),
	resolve: {
		alias: {
			"@": path.resolve(generatedRoot, "./src"),
			react: path.resolve(webNodeModules, "react"),
			"react-dom": path.resolve(webNodeModules, "react-dom"),
			"react/jsx-runtime": path.resolve(webNodeModules, "react", "jsx-runtime.js"),
			"@fontsource": path.resolve(webNodeModules, "@fontsource"),
			"highlight.js": path.resolve(webNodeModules, "highlight.js"),
		},
		dedupe: ["react", "react-dom", "i18next", "react-i18next"],
	},
	server: {
		host: SERVER_HOST,
		port: WEB_PORT,
		proxy: {
			"/api": { target: SERVER_HTTP, changeOrigin: true, proxyTimeout: 30_000 },
			"/ws": { target: SERVER_HTTP, ws: true, changeOrigin: true, proxyTimeout: 30_000 },
		},
	},
	build: {
		outDir: path.resolve(repoRoot, "apps", "web", "dist-zh"),
		emptyOutDir: true,
		sourcemap: true,
	},
	css: {
		postcss: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			plugins: [tailwindcss({ config: path.resolve(webRoot, "tailwind.config.ts") }) as any, autoprefixer() as any],
		},
	},
});

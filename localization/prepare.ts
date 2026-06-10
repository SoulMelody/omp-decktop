import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, "apps", "web");
const generatedRoot = path.join(repoRoot, ".generated", "web-root-i18n");
const generatedSrc = path.join(generatedRoot, "src");

async function main(): Promise<void> {
	await rm(generatedRoot, { recursive: true, force: true });
	await mkdir(generatedRoot, { recursive: true });
	await symlink(path.join(webRoot, "node_modules"), path.join(generatedRoot, "node_modules"), "junction");

	await cp(path.join(webRoot, "public"), path.join(generatedRoot, "public"), { recursive: true });
	await cp(path.join(webRoot, "src"), generatedSrc, { recursive: true });
	await rewriteGeneratedStyles();

	const indexHtml = await readFile(path.join(webRoot, "index.html"), "utf8");
	await writeFile(
		path.join(generatedRoot, "index.html"),
		indexHtml.replace('/src/main.tsx', '/src/main.zh.tsx'),
		"utf8",
	);

	const mainSource = await readFile(path.join(webRoot, "src", "main.tsx"), "utf8");
	const localizedMain = injectI18nImport(mainSource);
	await writeFile(path.join(generatedSrc, "main.zh.tsx"), localizedMain, "utf8");
}

function injectI18nImport(source: string): string {
	if (source.includes('./i18n"') || source.includes("./i18n'")) return source;

	const importStyles = 'import "./styles.css";';
	if (source.includes(importStyles)) {
		return source.replace(importStyles, `${importStyles}\nimport "./i18n";`);
	}

	const lines = source.split(/\r?\n/);
	const lastImportIndex = findLastImportIndex(lines);
	if (lastImportIndex === -1) return `import "./i18n";\n${source}`;
	lines.splice(lastImportIndex + 1, 0, 'import "./i18n";');
	return `${lines.join("\n")}\n`;
}

function findLastImportIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		if (lines[i]?.startsWith("import ")) return i;
	}
	return -1;
}

async function rewriteGeneratedStyles(): Promise<void> {
	const stylesPath = path.join(generatedSrc, "styles.css");
	const source = await readFile(stylesPath, "utf8");
	const rewritten = source
		.replaceAll('@import "@fontsource/', '@import "../../../apps/web/node_modules/@fontsource/')
		.replaceAll('@import "highlight.js/', '@import "../../../apps/web/node_modules/highlight.js/');
	await writeFile(stylesPath, rewritten, "utf8");
}

void main().catch((error) => {
	console.error("[l10n:prepare] failed:", error);
	process.exitCode = 1;
});

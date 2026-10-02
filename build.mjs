// Bundles the engine and the app into one page. `index.html` is the standalone site,
// `dist/outpost.html` is the same page without the outer document, for embedding.
import { build } from 'esbuild';
import fs from 'node:fs';

const r = await build({ entryPoints: ['app/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2019', legalComments: 'none' });
const js = r.outputFiles[0].text;
const css = fs.readFileSync('app/style.css', 'utf8');
const markup = fs.readFileSync('app/markup.html', 'utf8');
const fonts = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400..700&display=swap';
const libs = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
].map(u => `<script src="${u}"></script>`).join('\n');

const page = `<title>Outpost</title>
<link rel="stylesheet" href="${fonts}">
<style>
${css}</style>
${markup}
${libs}
<script>
${js}</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/outpost.html', page);
fs.writeFileSync('index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="description" content="Outpost is a base of operations for AI agents: see your crew at work, set what each bot may touch, and decide the risky calls yourself.">
<meta name="theme-color" content="#0B0C26">
<link rel="icon" href="brand/favicon.svg">
</head>
<body>
${page}</body>
</html>
`);
console.log('built', (page.length / 1024).toFixed(0) + ' KB');

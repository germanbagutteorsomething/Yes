import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildStandaloneHtml() {
  const virtualPwaShim = {
    name: 'virtual-pwa-register-shim',
    resolveId(id) {
      if (id === 'virtual:pwa-register') return '\0virtual:pwa-register';
      return null;
    },
    load(id) {
      if (id === '\0virtual:pwa-register') {
        return 'export function registerSW() { return () => {}; }';
      }
      return null;
    },
  };

  const result = await build({
    root: rootDir,
    configFile: false,
    logLevel: 'silent',
    plugins: [react(), tailwindcss(), virtualPwaShim],
    build: {
      write: false,
      outDir: 'dist-standalone',
      cssCodeSplit: false,
      assetsInlineLimit: 100000000,
      rollupOptions: {
        input: path.resolve(rootDir, 'src/main.tsx'),
        output: {
          format: 'iife',
          name: 'SquareEightApp',
          inlineDynamicImports: true,
          entryFileNames: 'bundle.js',
          assetFileNames: 'bundle.[ext]',
        },
      },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  const bundle = outputs[0];
  let jsCode = '';
  let cssCode = '';

  for (const chunk of bundle.output) {
    if (chunk.type === 'chunk' && chunk.fileName.endsWith('.js')) {
      jsCode = chunk.code;
    } else if (chunk.type === 'asset' && chunk.fileName.endsWith('.css')) {
      cssCode += typeof chunk.source === 'string' ? chunk.source : chunk.source.toString('utf8');
    }
  }

  const stockfishAsmPath = path.resolve(
    rootDir,
    'node_modules/stockfish/bin/stockfish-19-asm.js'
  );
  const stockfishAsm = fs.readFileSync(stockfishAsmPath, 'utf8');

  const safeJs = jsCode.replace(/<\/script>/gi, '<\\/script>');
  const safeCss = cssCode.replace(/<\/style>/gi, '<\\/style>');
  const safeStockfishLiteral = JSON.stringify(stockfishAsm).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>SquareEight — Standalone Chess</title>
    <meta name="description" content="Self-contained offline Chess with two-player mode and calibrated Stockfish levels." />
    <style>
${safeCss}
    </style>
  </head>
  <body class="bg-stone-100 text-stone-900 antialiased selection:bg-emerald-700/15 selection:text-emerald-900">
    <div id="root"></div>
    <script>
window.__EMBEDDED_STOCKFISH_ASM__ = ${safeStockfishLiteral};
    </script>
    <script>
${safeJs}
    </script>
  </body>
</html>
`;

  const rootOut = path.resolve(rootDir, 'squareeight-chess.html');
  const publicOut = path.resolve(rootDir, 'public/squareeight-chess.html');
  fs.writeFileSync(rootOut, html, 'utf8');
  fs.writeFileSync(publicOut, html, 'utf8');

  const sizeMb = (Buffer.byteLength(html, 'utf8') / (1024 * 1024)).toFixed(2);
  console.log(`Built standalone HTML (${sizeMb} MB): squareeight-chess.html & public/squareeight-chess.html`);
}

buildStandaloneHtml().catch((err) => {
  console.error(err);
  process.exit(1);
});

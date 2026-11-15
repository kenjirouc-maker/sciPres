/* Build: bundles src/main.js (three + postprocessing + deck) with esbuild and inlines it into
   src/index.html, producing ONE self-contained file that runs offline from file:// or any host.

     npm run build   -> dist/EVOQUEST_Presentation.html
     npm run dev     -> http://localhost:8000 (rebuilds on every reload)                       */
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const TAG = '<script src="./app.js"></script>';
const common = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome90', 'safari15', 'firefox90', 'edge90'],
  legalComments: 'eof',
  logLevel: 'info',
};

if (process.argv.includes('--dev')) {
  const ctx = await esbuild.context({ ...common, outfile: 'src/app.js', sourcemap: true });
  const { port } = await ctx.serve({ servedir: 'src', port: 8000 });
  console.log(`dev server: http://localhost:${port}/`);
} else {
  const res = await esbuild.build({ ...common, write: false, minify: true, treeShaking: true, metafile: true });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = await readFile('src/index.html', 'utf8');
  if (!html.includes(TAG)) throw new Error(`src/index.html must contain ${TAG}`);
  const out = html.replace(TAG, () => `<script>\n${js}</script>`);
  await mkdir('dist', { recursive: true });
  await writeFile('dist/EVOQUEST_Presentation.html', out);
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  const inputs = Object.entries(res.metafile.outputs)[0][1].inputs;
  const by = (re) => Object.entries(inputs).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v.bytesInOutput, 0);
  console.log(`dist/EVOQUEST_Presentation.html  ${kb(out.length)}  (script ${kb(js.length)}: three ${kb(by(/node_modules\/three\//))}, postprocessing ${kb(by(/node_modules\/postprocessing\//))}, app ${kb(by(/^src\//))})`);
}

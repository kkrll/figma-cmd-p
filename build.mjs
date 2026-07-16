import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');

async function build() {
  fs.mkdirSync('dist', { recursive: true });

  await esbuild.build({
    entryPoints: ['src/code.ts'],
    bundle: true,
    outfile: 'dist/code.js',
    target: 'es2019',
    logLevel: 'silent',
  });

  const ui = await esbuild.build({
    entryPoints: ['src/ui/ui.ts'],
    bundle: true,
    write: false,
    target: 'es2019',
    logLevel: 'silent',
  });
  // Escape closing script tags so the inlined bundle can't terminate the <script> block.
  const js = ui.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
  const template = fs.readFileSync('src/ui/ui.html', 'utf8');
  const marker = '/*__UI_SCRIPT__*/';
  if (!template.includes(marker)) throw new Error(`ui.html is missing the ${marker} marker`);
  fs.writeFileSync('dist/ui.html', template.replace(marker, () => js));

  console.log(`[${new Date().toLocaleTimeString()}] built dist/code.js + dist/ui.html`);
}

await build().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

if (watch) {
  console.log('watching src/ …');
  let timer = null;
  fs.watch('src', { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      build().catch((err) => console.error(err.message ?? err));
    }, 100);
  });
}

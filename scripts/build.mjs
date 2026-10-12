import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unpackTropiPhotos } from './photo-archive.mjs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'demo';
if (!['demo', 'firebase', 'worker'].includes(mode)) throw new Error('Modo de build invalido.');
const read = name => readFile(path.join(root, name), 'utf8');
const fingerprint = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

let config = { mode: 'demo' }, cloud = 'window.TropiCloud=null;';
if (mode !== 'demo') {
  config = JSON.parse(await read('config/firebase.local.json'));
  if (config.firebase?.projectId !== 'tropisertao-854d3') throw new Error('Projeto Firebase diferente do Tropi do Sertao.');
  for (const field of ['apiKey','authDomain','appId']) if (!config.firebase[field]) throw new Error('Firebase incompleto: ' + field);
  if (!config.appCheckSiteKey && !config.emulators) throw new Error('Chave publica App Check nao configurada.');
  if (mode === 'worker' && config.workerApiUrl !== 'https://tropisertao-api.0vieira-francisco0.workers.dev') throw new Error('Endereco do Worker inesperado.');
  config.mode = mode;
  const { build } = await import('esbuild');
  const bundle = await build({entryPoints: [path.join(root, mode === 'worker' ? 'client/worker-client.js' : 'client/firebase-client.js')], bundle: true, platform: 'browser', format: 'iife', target: ['es2022'], minify: true, write: false});
  cloud = bundle.outputFiles[0].text;
  if (cloud.length < 80000) throw new Error('O Firebase nao foi compilado corretamente. A publicacao foi bloqueada.');
}
let html = await read('src.html');
let css = await read('style.css');
let js = (await read('app.js')).replace('// CLOUD_BRIDGE', await read('client/cloud-ui.inc.js'));
if (!js.includes('window.TropiCloud') && !js.includes('CLOUD')) throw new Error('Interface do Firebase ausente.');
const logic = await read('logic.js');
await mkdir(path.join(root, 'functions/lib'), {recursive:true});
await writeFile(path.join(root,'functions/lib/catalog.cjs'), logic + '\nmodule.exports = globalThis.TropiRules;\n');

const assets = {};
for (const filename of await readdir(path.join(root,'assets'))) {
  if (filename.endsWith('.webp')) assets['assets/'+filename] = 'data:image/webp;base64,' + (await readFile(path.join(root,'assets',filename))).toString('base64');
}
// Quando o arquivo de fotos em alta resolucao for enviado ao repositorio,
// suas imagens substituem as antigas usando os mesmos identificadores nos cards.
// Nao altera fotos da logo nem o layout dos produtos.
let uploadedPhotoCount=0;
const externalPhotos=new Map();

try {
  const photoZip=await readFile(path.join(root,'assets','fotos-tropi-2026.zip'));
  const replacements=unpackTropiPhotos(photoZip);
  for(const [filename,bytes] of replacements) {
    const url='fotos/'+filename.replace(/\.webp$/,'.'+fingerprint(bytes)+'.webp');
    assets['assets/'+filename]=url;
    externalPhotos.set(url,bytes);
  }
  uploadedPhotoCount=replacements.size;
} catch(error) {
  if(error.code!=='ENOENT') throw error;
}

// As fotos continuam iguais as do site de referencia da Vercel.
html = html.replace(/assets\/[\w-]+\.webp/g, key => assets[key] || key);
for (const [,font] of css.matchAll(/(assets\/[\w-]+\.woff)/g)) {
  const contents = await readFile(path.join(root,font));
  css = css.replaceAll(font, 'data:font/woff;base64,'+contents.toString('base64'));
}
js = js.replace('const asset=path=>path;', 'const bundledAssets='+JSON.stringify(assets)+';\nconst asset=path=>bundledAssets[path]||path;');
const runtime = 'window.TropiConfig=' + JSON.stringify(config).replaceAll('<','\\u003c')+';';
const dist = path.join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for (const [filepath,bytes] of externalPhotos) {
  const output=path.join(dist,filepath);
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,bytes);
}
const manifest = {};
for (const [prefix,ext,contents] of [
  ['visual','css',css], ['config','js',runtime], ['regras','js',logic], ['firebase','js',cloud], ['site','js',js]
]) {
  const filename = `${prefix}.${fingerprint(contents)}.${ext}`;
  await writeFile(path.join(dist, filename),contents);
  manifest[prefix] = filename;
}
const link = `<link rel="stylesheet" href="${manifest.visual}">`;
const scripts = `<script src="${manifest.config}" defer></script><script src="${manifest.regras}" defer></script><script src="${manifest.firebase}" defer></script><script src="${manifest.site}" defer></script>`;
html = html.replace('<link rel="stylesheet" href="style.css">', link)
  .replace('<script src="logic.js"></script>', scripts)
  .replace('<script src="app.js"></script>', '');
if (!html.includes(manifest.visual) || !html.includes(manifest.firebase) || !html.includes(manifest.site)) throw new Error('HTML invalido: as referencias dos arquivos JS e CSS nao foram aplicadas.');
if (html.includes('<script src="logic.js"') || html.includes('<script src="app.js"')) throw new Error('HTML antigo nao substituido.');
if (!html.includes('id="cardapio"') || !html.includes('id="account-dialog"') || !html.includes('class="banner"')) throw new Error('O layout original nao foi encontrado.');
const version = fingerprint(html);
html = html.replace('</head>', `<meta name="tropi-build" content="${version}"></head>`);
await writeFile(path.join(dist,'index.html'),html);
await writeFile(path.join(dist,'build-info.json'),JSON.stringify({mode,projectId:config.firebase?.projectId||null,builtAt:new Date().toISOString(),version,uploadedPhotoCount,manifest},null,2));
await copyFile(path.join(root,'preview.html'),path.join(dist,'preview.html'));
console.log('Build '+mode+' concluido. Versao: '+version+'; arquivos JS e CSS separados, com cache individual.');

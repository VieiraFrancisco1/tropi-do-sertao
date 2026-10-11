import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const projectAt = process.argv.indexOf('--project');
const project = projectAt >= 0 ? process.argv[projectAt + 1] : '';
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || project.startsWith('demo-') || /SEU_|YOUR_/i.test(project)) throw new Error('Informe npm run deploy -- --project SEU_PROJECT_ID_REAL.');
const build = JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'));
if (build.mode !== 'firebase' || build.emulators || build.projectId !== project) throw new Error('Gere uma versão Firebase real para o MESMO projeto antes de publicar.');
const savedPackage = await readFile(new URL('../functions/package.json', import.meta.url), 'utf8');
if (JSON.parse(savedPackage).main !== 'index.cjs') throw new Error('Restaure main: index.cjs em functions/package.json antes de publicar.');
const cli = fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url));
const coreOnly = process.argv.includes('--core-only');
const functions = ['createOrder', 'updateOrderStatus', 'cashAction', 'getOrderReport', 'getStoreConnection'];
const only = coreOnly
  ? ['hosting', 'firestore', ...functions.map(name => 'functions:tropisertao:' + name)].join(',')
  : 'hosting,firestore,functions:tropisertao';
const generated = new URL('../firebase.core.generated.json', import.meta.url);
const args = [cli, 'deploy', '--project', project, '--only', only];
let generatedHere = false;
let originalPackage = null;
const packageFile = new URL('../functions/package.json', import.meta.url);
try {
  if (coreOnly) {
    const config = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
    config.hosting.rewrites = config.hosting.rewrites.filter(rule => rule.source !== '/api/whatsapp/webhook');
    await writeFile(generated, JSON.stringify(config, null, 2), { flag: 'wx' });
    generatedHere = true;
    const pkg = JSON.parse(savedPackage);
    originalPackage = savedPackage;
    await writeFile(packageFile, JSON.stringify({ ...pkg, main: 'core.cjs' }, null, 2));
    args.push('--config', 'firebase.core.generated.json');
  }
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (originalPackage !== null) await writeFile(packageFile, originalPackage);
  if (generatedHere) await unlink(generated).catch(() => {});
}

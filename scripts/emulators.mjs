import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
// Local UI rehearsal uses only order/cash/report APIs. WhatsApp is tested with
// stubbed transport in integration.test.cjs, never against a real number.
const cli = fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url));
const packageFile = new URL('../functions/package.json', import.meta.url);
const original = await readFile(packageFile, 'utf8'), pkg = JSON.parse(original);
if (pkg.main !== 'index.cjs') throw new Error('Restaure main: index.cjs em functions/package.json antes de iniciar.');
try {
  await writeFile(packageFile, JSON.stringify({ ...pkg, main: 'core.cjs' }, null, 2));
  const child = spawn(process.execPath, [cli, 'emulators:start', '--project', 'demo-tropisertao', '--only', 'firestore,auth,functions,hosting'], {
    stdio: 'inherit', shell: false
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
} finally { await writeFile(packageFile, original); }

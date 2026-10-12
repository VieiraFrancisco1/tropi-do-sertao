/** Safe configuration audit before connecting real orders. No secrets printed. */
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [], warnings = [], ok = [];
const load = async filename => {
  try { return await readFile(path.join(root, filename), 'utf8'); }
  catch { errors.push('Arquivo ausente: ' + filename); return null; }
};
const configText = await load('config/firebase.local.json');
let config;
if (configText) {
  try { config = JSON.parse(configText); }
  catch { errors.push('config/firebase.local.json não é um JSON válido.'); }
}
if (config) {
  if (config.mode && config.mode !== 'worker') warnings.push('A configuração é destinada ao modo worker.');
  for (const key of ['apiKey','authDomain','projectId','appId']) {
    const value = config.firebase?.[key];
    if (typeof value !== 'string' || !value.trim() || /^(SEU_|YOUR_|EXEMPLO|SUBSTITUIR)/i.test(value)) errors.push('Configuração pública Firebase incompleta: '+key);
  }
  if (!config.emulators && !config.appCheckSiteKey) errors.push('Falta a chave pública do App Check (appCheckSiteKey).');
  if (config.emulators) errors.push('Emuladores estão ligados: não é uma configuração de produção.');
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(config.workerApiUrl || '')) errors.push('Falta URL HTTPS do Worker em workerApiUrl (sem / final).');
  if (config.firebase?.projectId && !config.firebase.authDomain?.endsWith('.firebaseapp.com')) warnings.push('Confira authDomain do aplicativo Web no Firebase.');
}
const workerText = await load('worker/wrangler.toml');
if (workerText) {
  const project = workerText.match(/^FIREBASE_PROJECT_ID\s*=\s*"([^"]*)"/m)?.[1];
  const appId = workerText.match(/^FIREBASE_APP_ID\s*=\s*"([^"]*)"/m)?.[1];
  const origins = workerText.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m)?.[1];
  const whatsapp = workerText.match(/^WHATSAPP_ENABLED\s*=\s*"([^"]*)"/m)?.[1];
  if (!project || /SUBSTITUIR|EXEMPLO|YOUR/i.test(project)) errors.push('Defina FIREBASE_PROJECT_ID no worker/wrangler.toml.');
  if (config?.firebase?.projectId && project !== config.firebase.projectId) errors.push('O projeto do Worker não corresponde ao projeto Firebase da interface.');
  if (!appId || config?.firebase?.appId && appId !== config.firebase.appId) errors.push('O aplicativo do Worker não corresponde ao aplicativo Firebase da interface.');
  if (!origins || /SUBSTITUIR|YOUR/i.test(origins)) errors.push('Configure ALLOWED_ORIGINS com o domínio do Firebase Hosting.');
  else if (config?.firebase?.projectId && !origins.split(',').some(x => x.trim() === 'https://' + config.firebase.projectId + '.web.app')) warnings.push('Verifique se ALLOWED_ORIGINS contém a URL real do Hosting.');
  if (whatsapp !== 'false') warnings.push('WHATSAPP_ENABLED está ativo. Para validar pedidos primeiro, mantenha false.');
  else ok.push('WhatsApp permanece desligado durante os testes de pedidos.');
}
const spark = await load('firebase.spark.json');
if (spark) {
 try {
  const settings = JSON.parse(spark);
  if (settings.functions) errors.push('Firebase Spark não pode publicar functions.');
  if (!settings.hosting || !settings.firestore?.rules) errors.push('Falta Hosting ou regras do Firestore.');
  else ok.push('Deploy Spark inclui Hosting e Firestore, sem Functions.');
 } catch { errors.push('firebase.spark.json inválido.'); }
}
if (+process.versions.node.split('.')[0] < 24 || (+process.versions.node.split('.')[0] === 24 && (+process.versions.node.split('.')[1] < 12))) {
 warnings.push('Node.js ' + process.version + ': instale Node.js 24.12+ para as dependências Firebase atuais.');
} else ok.push('Node.js compatível com as dependências do projeto.');
try { await access(path.join(root,'node_modules','esbuild')); ok.push('Pacotes npm instalados.'); }
catch { warnings.push('Dependências npm ainda não instaladas: execute npm ci.'); }
console.log('\nTropi do Sertão — verificação antes de publicar\n');
for (const line of ok) console.log('OK      '+line);
for (const line of warnings) console.log('AVISO   '+line);
for (const line of errors) console.log('PENDENTE '+line);
console.log(`\n${errors.length} pendência(s) obrigatória(s); ${warnings.length} aviso(s).`);
if(errors.length) process.exitCode=1;

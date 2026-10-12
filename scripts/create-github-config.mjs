import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.TROPI_APP_CHECK_SITE_KEY?.trim();
if (!key) throw new Error('Falta TROPI_APP_CHECK_SITE_KEY (chave publica).');
const config = {
  mode: 'worker',
  pixKey: process.env.TROPI_PIX_KEY?.trim() || '',
  firebase: {
    apiKey: 'AIzaSyCTxKI6ke0lUWmb2XxuvHaw_nUFk0mjFRk',
    authDomain: 'tropisertao-854d3.firebaseapp.com',
    projectId: 'tropisertao-854d3',
    storageBucket: 'tropisertao-854d3.firebasestorage.app',
    messagingSenderId: '356550892810',
    appId: '1:356550892810:web:11cd031fd88b08d4d62ef3'
  },
  appCheckSiteKey: key,
  emulators: false,
  workerApiUrl: 'https://tropisertao-api.0vieira-francisco0.workers.dev'
};
await writeFile('config/firebase.local.json', JSON.stringify(config, null, 2));
const hosting = JSON.parse(await readFile('firebase.spark.json', 'utf8'));
hosting.hosting.site = 'tropidosertao';
delete hosting.firestore;
await writeFile('firebase.github.json', JSON.stringify(hosting, null, 2));
console.log('Configuracao publica criada para o Hosting tropidosertao.');

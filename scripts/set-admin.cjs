'use strict';
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
const projectId = args.includes('--project') ? get('--project') : '';
const uid = args.includes('--uid') ? get('--uid') : '';
if (!projectId || !uid || /SEU_|YOUR_/i.test(projectId)) throw new Error('Use --project PROJECT_ID --uid UID_DO_DONO. Requer credenciais administrativas locais.');
initializeApp({ credential: applicationDefault(), projectId });
(async () => {
  const auth = getAuth(), user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  if (args.includes('--revoke')) delete claims.tropiAdmin; else claims.tropiAdmin = true;
  await auth.setCustomUserClaims(uid, claims);
  console.log(args.includes('--revoke') ? 'Acesso de dono removido.' : 'Acesso de dono atribuído. Saia e entre novamente para atualizar o token.');
})().catch(error => { console.error(error.code || 'Não foi possível configurar o dono.'); process.exitCode = 1; });

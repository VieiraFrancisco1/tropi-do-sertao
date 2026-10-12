/** Non-destructive production smoke test: no orders and no credentials. */
const [endpoint, allowedOrigin] = process.argv.slice(2);
if (!endpoint || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(endpoint) || !allowedOrigin || !/^https:\/\/[A-Za-z0-9.-]+$/.test(allowedOrigin)) {
  console.error('Uso: npm run test:worker:live -- https://tropisertao-api.SUACONTA.workers.dev https://SEU-PROJETO.web.app');
  process.exit(2);
}
const url=endpoint+'/api/health';
try {
  const result=await fetch(url, { headers: { Origin: allowedOrigin }, signal: AbortSignal.timeout(12000) });
  const data=await result.json();
  if (!result.ok || data.status !== 'ok') throw new Error('Health endpoint indisponível.');
  console.log('OK: Worker respondeu em '+url);
  if(data.database!=='ok')throw new Error('A API não confirmou o acesso ao banco de pedidos.');
  console.log('OK: acesso do servidor ao Firestore confirmado por transação de leitura.');
  console.log('WhatsApp automático: '+(data.whatsappEnabled ? 'ativado — confirme se isso é esperado' : 'desativado'));
  if (result.headers.get('access-control-allow-origin') !== allowedOrigin) throw new Error('CORS: domínio da loja não está liberado no Worker.');
  console.log('OK: origem do Firebase Hosting liberada pelo Worker.');
  const preflight=await fetch(endpoint+'/api/createOrder',{method:'OPTIONS', headers:{Origin:allowedOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, X-Firebase-AppCheck, Content-Type'},signal:AbortSignal.timeout(12000)});
  if(preflight.status!==204)throw new Error('OPTIONS/CORS inválido: HTTP '+preflight.status);
  console.log('OK: requisições de pedidos estão liberadas por CORS.');
  console.log('AVISO: esta checagem não cria pedidos e não valida login do cliente, App Check ou gravação de um pedido real.');
} catch(error) { console.error('FALHA: '+error.message); process.exitCode=1; }

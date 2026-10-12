import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('./worker-client.js',import.meta.url),'utf8');
const begin=source.indexOf('const call = async (name, data) => {');
const end=source.indexOf('\nwindow.TropiCloud =',begin);
assert.ok(begin>=0&&end>begin);
const code=source.slice(begin,end);
const ui=readFileSync(new URL('./cloud-ui.inc.js',import.meta.url),'utf8');
const errorCode=ui.slice(ui.indexOf(' function cloudError(error){'),ui.indexOf('\n function refreshVisible(){'));
function requestHarness(fetch,{schedule=setTimeout,cancel=clearTimeout,ready=Promise.resolve(),getToken=async()=>({token:'test-app-check-token'}),getIdToken=async()=> 'test-identity-token'}={}){
 return new Function('deps',`const {ready,auth,appCheck,getToken,config,fetch,AbortController,setTimeout,clearTimeout}=deps;${code};return call;`)({
  ready,auth:{currentUser:{getIdToken}},appCheck:{},getToken,
  config:{workerApiUrl:'https://example.test/'},fetch,AbortController,setTimeout:schedule,clearTimeout:cancel
 });
}

test('o pedido mantém autenticação, App Check e a chave de repetição',async()=>{
 const data={requestKey:'request-key-00001',lines:[{productId:'300',qty:1}]};
 const call=requestHarness(async(url,options)=>{
  assert.equal(url,'https://example.test/api/createOrder');
  assert.equal(options.headers.Authorization,'Bearer test-identity-token');
  assert.equal(options.headers['X-Firebase-AppCheck'],'test-app-check-token');
  assert.deepEqual(JSON.parse(options.body),data);
  assert.equal(options.cache,'no-store');
  return Response.json({order:{id:'TROPI-001'}});
 });
 assert.deepEqual(await call('createOrder',data),{order:{id:'TROPI-001'}});
});

test('a falha de segurança do servidor chega à tela como uma mensagem legível',async()=>{
 const message='Não foi possível verificar a segurança desta sessão. Recarregue a página.';
 const call=requestHarness(async()=>Response.json({error:message,code:'permission-denied'},{status:403}));
 const notices=[];
 const showError=new Function('toast',errorCode+';return cloudError;')(message=>notices.push(message));
 await assert.rejects(call('createOrder',{}),error=>{showError(error);return error.code==='permission-denied';});
 assert.deepEqual(notices,[message]);
});

test('erros técnicos do Firebase continuam sem expor links internos na tela',()=>{
 const notices=[];
 const showError=new Function('toast',errorCode+';return cloudError;')(message=>notices.push(message));
 showError({code:'failed-precondition',message:'The query requires an index. https://console.firebase.google.com/private-link'});
 assert.deepEqual(notices,['Não foi possível atualizar seus pedidos agora. Tente novamente.']);
});

test('um pedido sem resposta encerra a espera e libera uma nova tentativa',async()=>{
 let abort,resolveStarted,cancelled=false;
 const started=new Promise(resolve=>{resolveStarted=resolve;});
 const call=requestHarness(async(url,options)=>{
  resolveStarted();
  return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
 },{schedule:(callback,delay)=>{assert.equal(delay,30000);abort=callback;return 42;},cancel:id=>{assert.equal(id,42);cancelled=true;}});
 const request=call('createOrder',{});
 await started;
 abort();
 await assert.rejects(request,error=>error.code==='unavailable'&&/demorou a responder/.test(error.publicMessage));
 assert.equal(cancelled,true);
});


test('o prazo inclui a preparação da sessão e não registra um pedido depois de expirar',async()=>{
 for(const stage of ['ready','getIdToken','getToken']){
  let release,expire,cancelled=false,requests=0;
  const pending=new Promise(resolve=>{release=resolve;});
  const settings={schedule:(callback,delay)=>{assert.equal(delay,30000);expire=callback;return 7;},cancel:id=>{assert.equal(id,7);cancelled=true;}};
  settings[stage]=stage==='ready'?pending:()=>pending;
  const call=requestHarness(async()=>{requests++;return Response.json({});},settings);
  const operation=call('createOrder',{});
  // Let the authentication preparation reach the blocked await.
  await Promise.resolve();await Promise.resolve();
  expire();
  await assert.rejects(operation,error=>error.code==='unavailable'&&/demorou/.test(error.publicMessage));
  release(stage==='getToken'?{token:'late-token'}:'late-identity-token');
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(requests,0);
  assert.equal(cancelled,true);
 }
});

test('o prazo inclui a leitura da resposta do servidor',async()=>{
 let expire,reading,cancelled=false;
 const started=new Promise(resolve=>{reading=resolve;});
 const call=requestHarness(async()=>({ok:true,json(){reading();return new Promise(()=>{});}}),{
  schedule:callback=>{expire=callback;return 8;},cancel:id=>{assert.equal(id,8);cancelled=true;}
 });
 const operation=call('createOrder',{});
 await started;
 expire();
 await assert.rejects(operation,error=>/demorou a responder/.test(error.publicMessage));
 assert.equal(cancelled,true);
});

test('a falha de preparação do App Check é legível e não cria pedido',async()=>{
 let requests=0;
 const call=requestHarness(async()=>{requests++;return Response.json({});},{getToken:async()=>{throw new Error('Technical token error');}});
 await assert.rejects(call('createOrder',{}),error=>/verificar esta sessão/.test(error.publicMessage));
 assert.equal(requests,0);
});

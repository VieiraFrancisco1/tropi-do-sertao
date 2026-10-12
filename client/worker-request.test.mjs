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
function requestHarness(fetch,{schedule=setTimeout,cancel=clearTimeout}={}){
 return new Function('deps',`const {ready,auth,appCheck,getToken,config,fetch,AbortController,setTimeout,clearTimeout}=deps;${code};return call;`)({
  ready:Promise.resolve(),auth:{currentUser:{getIdToken:async()=> 'test-identity-token'}},appCheck:{},getToken:async()=>({token:'test-app-check-token'}),
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

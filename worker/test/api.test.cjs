'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {configure}=require('../app.cjs');
const {createFirestore,fieldsOf,docData}=require('../firestore.cjs');
const crypto=require('node:crypto');
const baseEnv={FIREBASE_PROJECT_ID:'demo-tropisertao',ALLOWED_ORIGINS:'https://tropi.web.app',WHATSAPP_ENABLED:'false'};
const makeReq=(path,body={},headers={})=>new Request('https://tropi.workers.dev/api/'+path,{method:'POST',headers:{origin:'https://tropi.web.app',authorization:'Bearer test-token','x-firebase-appcheck':'test-app-check','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('unauthenticated requests and unauthorized origins fail before database access',async()=>{
  const api=configure(baseEnv,{db:{},authorize:async()=>({uid:'u',admin:false}),checkApp:async()=>true});
  const bad=new Request('https://tropi.workers.dev/api/createOrder',{method:'POST',headers:{origin:'https://evil.example','authorization':'Bearer token'}});
  assert.equal((await api.handle(bad)).status,403);
  assert.equal((await api.handle(makeReq('createOrder',{}, {authorization:''}))).status,401);
});
test('customer cannot call owner-only endpoints; user authentication + app check are required',async()=>{
  const api=configure(baseEnv,{db:{},authorize:async()=>({uid:'u',admin:false}),checkApp:async()=>true});
  for(const name of ['getStoreConnection','updateOrderStatus','cashAction','getOrderReport']){
    const res=await api.handle(makeReq(name));
    assert.equal(res.status,403,name);
  }
  const bad=configure(baseEnv,{db:{},authorize:async()=>({uid:'u',admin:true}),checkApp:async()=>{throw new Error('Invalid App Check');}});
  assert.equal((await bad.handle(makeReq('getStoreConnection'))).status,403);
});
test('connection reports disabled whatsapp and health does not leak credentials',async()=>{
  const api=configure(baseEnv,{db:{},authorize:async()=>({uid:'admin',admin:true}),checkApp:async()=>true});
  const res=await api.handle(makeReq('getStoreConnection'));
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{whatsappEnabled:false});
});
test('Firestore map fields and dotted updates serialize nested values correctly',()=>{
  const input={id:'TROPI-001',count:42,ok:true,notes:null,lines:[{qty:1,label:'Suco'}],notifications:{preparando:{state:'pending'}}};
  assert.deepEqual(docData({fields:fieldsOf(input)}),input);
  const {dottedToNested}=require('../firestore.cjs');
  assert.deepEqual(dottedToNested({'notifications.preparando':{state:'sent'},'updatedAt':4}),{notifications:{preparando:{state:'sent'}},updatedAt:4});
});
test('REST adapter transaction emits precondition for create, merges fields and uses OAuth',async()=>{
  const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const private_key=keys.privateKey.export({type:'pkcs8',format:'pem'});
  const events=[];
  const f=async(url,opts={})=>{
    events.push({url:String(url),opts});
    if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'oauth-test',expires_in:3600});
    if(String(url).endsWith(':beginTransaction'))return Response.json({transaction:'trans123'});
    if(String(url).endsWith('/orders/order-1?transaction=trans123'))return Response.json({error:{status:'NOT_FOUND'}},{status:404});
    if(String(url).endsWith(':commit'))return Response.json({writeResults:[]});
    if(String(url).endsWith(':rollback'))return Response.json({});
    throw new Error('Unexpected '+url);
  };
  const db=createFirestore({projectId:'demo-tropisertao',serviceAccount:{client_email:'test@x.iam.gserviceaccount.com',private_key},fetchImpl:f});
  await db.runTransaction(async tx=>{
    const ref=db.doc('orders/order-1'),snap=await tx.get(ref);
    assert.equal(snap.exists,false);
    tx.create(ref,{id:'order-1',date:10});
  });
  const commit=events.find(x=>x.url.endsWith(':commit'));
  assert.deepEqual(JSON.parse(commit.opts.body).writes[0].currentDocument,{exists:false});
  assert.match(events[0].opts.body,/grant_type/);
});
function fakeDb(){
 const store=new Map();
 const doc=path=>({path,id:path.split('/').at(-1),async get(){return snap(path);},async set(data,opts){write(path,data,opts);}});
 function snap(path){return{ref:doc(path),exists:store.has(path),data:()=>store.has(path)?structuredClone(store.get(path)):undefined};}
 function merge(a,b){for(const [k,v] of Object.entries(b)){if(v&&typeof v==='object'&&!Array.isArray(v)){a[k]=merge(a[k]||{},v);}else a[k]=v;}return a;}
 function write(path,data,opts){store.set(path,opts?.merge?merge(structuredClone(store.get(path)||{}),structuredClone(data)):structuredClone(data));}
 return {store,doc,runTransaction:async cb=>{
  const writes=[];
  const tx={get:async ref=>snap(ref.path),create:(ref,data)=>writes.push(()=>{if(store.has(ref.path))throw new Error('Document exists');write(ref.path,data);}),set:(ref,data,opts)=>writes.push(()=>write(ref.path,data,opts)),update:(ref,data)=>writes.push(()=>{const obj=structuredClone(store.get(ref.path)||{});for(const [k,v] of Object.entries(data)){const parts=k.split('.');let cursor=obj;for(const p of parts.slice(0,-1)){cursor=cursor[p]||=( {} );}cursor[parts.at(-1)]=v;}write(ref.path,obj);})};
  const result=await cb(tx);for(const w of writes)w();return result;
 },collection(name){let checks=[];return{where(key,op,value){checks.push([key,op,value]);return this;},async get(){return{docs:[...store.entries()].filter(([path])=>path.startsWith(name+'/')).filter(([,x])=>checks.every(([k,op,v])=>{const item=k.split('.').reduce((x,p)=>x?.[p],x);return op==='>='?item>=v:op==='<='?item<=v:op==='=='?item===v:false;})).map(([path,data])=>({id:path.split('/').at(-1),data:()=>structuredClone(data)}))};}};}};
}
test('customer order flow preserves server price and idempotency; owner changes stage',async()=>{
 const db=fakeDb();
 const customer={uid:'shopper1',admin:false},owner={uid:'owner1',admin:true};
 let current=customer;
 const api=configure(baseEnv,{db,authorize:async()=>current,checkApp:async()=>true});
 const orderInput={requestKey:'request-key-00001',name:'Cliente Teste',phone:'88999999999',payment:'Pix',delivery:'Retirada',address:'',reference:'',change:0,whatsappOptIn:false,lines:[{productId:'300',extras:[],comboJuiceId:'',qty:1,reward:false}]};
 let result=await api.handle(makeReq('createOrder',orderInput));
 assert.equal(result.status,200);let first=await result.json();
 assert.equal(first.order.total,600);
 result=await api.handle(makeReq('createOrder',orderInput));
 assert.equal(result.status,200);let second=await result.json();
 assert.equal(second.duplicate,true);assert.equal(second.order.id,first.order.id);
 assert.equal(db.store.get('controls/orderCounter').value,1);
 assert.equal(db.store.get('customers/shopper1').loyalty.qualifying,1);
 result=await api.handle(makeReq('updateOrderStatus',{id:first.order.id,status:'preparando',expectedStatus:'recebido'}));
 assert.equal(result.status,403);
 current=owner;
 result=await api.handle(makeReq('updateOrderStatus',{id:first.order.id,status:'preparando',expectedStatus:'recebido'}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).order.notifications.preparando.state,'disabled');
 result=await api.handle(makeReq('cashAction',{requestKey:'cash-request-00001',action:'open',openingCents:2000}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).session.status,'open');
 result=await api.handle(makeReq('updateOrderStatus',{id:first.order.id,status:'concluido',expectedStatus:'preparando'}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).order.status,'concluido');
 assert.equal(db.store.get('cashSessions/cash-request-00001').entries.length,1);
});
test('Firebase JWT signature, project, issuer and expiry are verified',async()=>{
 const {verifyFirebaseToken}=require('../auth.cjs');
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const pub=pair.publicKey.export({format:'jwk'});
 const now=Date.now();
 const claims={aud:'demo-tropisertao',iss:'https://securetoken.google.com/demo-tropisertao',sub:'test-uid',exp:Math.floor(now/1000)+1800,iat:Math.floor(now/1000)-3,auth_time:Math.floor(now/1000)-3,tropiAdmin:true};
 const enc=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
 const header=enc({alg:'RS256',kid:'test-kid'});
 const payload=enc(claims);
 const sig=crypto.sign('RSA-SHA256',Buffer.from(header+'.'+payload),pair.privateKey).toString('base64url');
 const mock=async()=>Response.json({keys:[{...pub,kty:'RSA',alg:'RS256',kid:'test-kid'}]},{headers:{'cache-control':'public, max-age=120'}});
 assert.deepEqual(await verifyFirebaseToken(header+'.'+payload+'.'+sig,'demo-tropisertao',{fetchImpl:mock,now:()=>now}),{uid:'test-uid',admin:true});
 await assert.rejects(verifyFirebaseToken(header+'.'+payload+'.'+sig.slice(0,-5)+'12345','demo-tropisertao',{fetchImpl:mock,now:()=>now}));
 await assert.rejects(verifyFirebaseToken(header+'.'+payload+'.'+sig,'wrong-project',{fetchImpl:mock,now:()=>now}));
});

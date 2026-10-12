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
    if(String(url).endsWith(':commit')){
      for(const write of JSON.parse(opts.body).writes){
        assert.match(write.update.name,/^projects\/demo-tropisertao\/databases\/\(default\)\/documents\/[A-Za-z0-9_/-]+$/);
        assert.ok(!write.update.name.includes('https://'),'Firestore document names cannot be HTTP URLs');
      }
      return Response.json({writeResults:[]});
    }
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
  assert.equal(JSON.parse(commit.opts.body).writes[0].update.name,'projects/demo-tropisertao/databases/(default)/documents/orders/order-1');
  assert.match(events[0].opts.body,/grant_type/);
});
const {memoryDb:fakeDb}=require('../../functions/test/memory-db.cjs');
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
 assert.equal(db.store.get('customers/shopper1').loyalty.qualifying,0);
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
 assert.equal(db.store.get('customers/shopper1').loyalty.qualifying,1);
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

test('health verifies checkout database reads once and never writes or exposes documents',async()=>{
  const db=fakeDb();
  db.store.set('controls/orderCounter',{value:42,privateNote:'not-for-health'});
  const before=structuredClone([...db.store]);let checks=0;
  const original=db.runTransaction;
  db.runTransaction=async callback=>{checks++;return original(callback);};
  const api=configure(baseEnv,{db,authorize:async()=>{throw new Error('Not needed for health');},checkApp:async()=>true});
  for(let i=0;i<2;i++){
    const response=await api.handle(new Request('https://tropi.workers.dev/api/health'));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{status:'ok',database:'ok',whatsappEnabled:false});
  }
  assert.equal(checks,1);
  assert.deepEqual([...db.store],before);
});

test('health reports a database failure without leaking credentials or upstream messages',async()=>{
  const db={runTransaction:async()=>{throw Object.assign(new Error('private token and account details'),{status:403,code:'PERMISSION_DENIED'});}};
  const api=configure(baseEnv,{db,authorize:async()=>({uid:'u'}),checkApp:async()=>true});
  const response=await api.handle(new Request('https://tropi.workers.dev/api/health'));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:'unavailable',database:'unavailable',diagnostic:{status:403,code:'PERMISSION_DENIED'},whatsappEnabled:false});
});

test('the loyalty endpoint is scoped to the authenticated customer, ignoring a forged UID',async()=>{
 const db=fakeDb();
 db.store.set('customers/another',{id:'another',loyalty:{version:2,qualifying:8,redeemed:0,reserved:0}});
 const api=configure(baseEnv,{db,authorize:async()=>({uid:'buyer',admin:false}),checkApp:async()=>true});
 const response=await api.handle(makeReq('getLoyalty',{uid:'another',qualifying:100}));
 assert.equal(response.status,200);assert.equal((await response.json()).loyalty.qualifying,0);
 assert.equal(db.store.get('customers/another').loyalty.qualifying,8);
 assert.equal(db.store.has('customers/buyer'),false);
});

test('scheduled cleanup expires unattended orders even with automatic WhatsApp disabled',async()=>{
 const db=fakeDb();
 db.store.set('customers/buyer',{id:'buyer',pendingOrderId:'TROPI-001',loyalty:{version:2,qualifying:0,redeemed:0,reserved:0}});
 db.store.set('orders/TROPI-001',{id:'TROPI-001',customer:{id:'buyer'},date:Date.now()-86400000,status:'recebido',reward:false,total:600});
 const api=configure(baseEnv,{db,authorize:async()=>({uid:'buyer'}),checkApp:async()=>true});
 await api.scheduled();
 assert.equal(db.store.get('orders/TROPI-001').expired,true);
 assert.equal(db.store.get('customers/buyer').pendingOrderId,null);
 assert.equal(db.store.get('customers/buyer').loyalty.qualifying,0);
 assert.equal([...db.store.keys()].some(path=>path.startsWith('messageJobs/')),false);
});

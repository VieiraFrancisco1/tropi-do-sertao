'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyAppCheck}=require('../auth.cjs');
const {configure}=require('../app.cjs');
const appId='1:123456789:web:abcdef123456';
const projectId='demo-tropisertao';
const at=Date.now(),seconds=Math.floor(at/1000);
const trusted=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const publicKey=(pair,kid)=>({...pair.publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'});
const claims=()=>({iss:'https://firebaseappcheck.googleapis.com/123456789',aud:['projects/123456789','projects/'+projectId],sub:appId,iat:seconds-3,exp:seconds+1800});
function token({header={},payload={},pair=trusted}={}){
 const h=encoded({alg:'RS256',typ:'JWT',kid:'trusted-app-check-key',...header});
 const p=encoded({...claims(),...payload});
 return h+'.'+p+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),pair.privateKey).toString('base64url');
}
const keys=async url=>{assert.equal(url,'https://firebaseappcheck.googleapis.com/v1/jwks');return Response.json({keys:[publicKey(trusted,'trusted-app-check-key')]},{headers:{'cache-control':'public, max-age=3600'}});};

test('valida o token normal do site por assinatura e permite seu uso até expirar',async()=>{
 let requests=0;
 const fetchImpl=async url=>{requests++;return keys(url);};
 const jwt=token();
 for(let i=0;i<2;i++)assert.deepEqual(await verifyAppCheck(jwt,appId,{fetchImpl,now:()=>at}),{appId});
 assert.equal(requests,1,'As chaves públicas devem ser reutilizadas; não há consumo de token ou chamada OAuth');
});

test('rejeita tokens ausentes, falsificados, expirados e de outro aplicativo ou projeto',async()=>{
 const invalid=[undefined,'not-a-jwt',token({pair:other}),token({payload:{exp:seconds-1}}),
  token({payload:{iat:seconds+100}}),token({payload:{aud:['projects/another-project']}}),
  token({payload:{iss:'https://attacker.example/123456789'}}),token({payload:{sub:'1:123456789:web:anotherApp'}}),
  token({header:{alg:'HS256'}}),token({header:{alg:'none'}}),token({header:{typ:'JWE'}})];
 for(const jwt of invalid)await assert.rejects(verifyAppCheck(jwt,appId,{fetchImpl:keys,now:()=>at}));
});

test('carrega as novas chaves públicas quando o Firebase troca a chave de assinatura',async()=>{
 let requests=0;
 const rotated=token({header:{kid:'rotated-app-check-key'},pair:other});
 const fetchImpl=async url=>{requests++;assert.equal(url,'https://firebaseappcheck.googleapis.com/v1/jwks');return Response.json({keys:[publicKey(other,'rotated-app-check-key')]});};
 assert.deepEqual(await verifyAppCheck(rotated,appId,{fetchImpl,now:()=>at}),{appId});
 assert.equal(requests,1);
});

test('a indisponibilidade das chaves não libera um token sem verificar a assinatura',async()=>{
 await assert.rejects(verifyAppCheck(token({header:{kid:'unknown-key'}}),appId,{fetchImpl:async()=>new Response('',{status:503}),now:()=>at}),/signing keys unavailable/);
});

const {memoryDb}=require('../../functions/test/memory-db.cjs');

test('o pedido percorre login assinado, App Check, preços e registro sem uma permissão extra de consumo',async t=>{
 const identity=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const h=encoded({alg:'RS256',kid:'identity-integration-key'});
 const p=encoded({aud:projectId,iss:'https://securetoken.google.com/'+projectId,sub:'real-signed-customer',iat:seconds-3,auth_time:seconds-3,exp:seconds+1800});
 const identityToken=h+'.'+p+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),identity.privateKey).toString('base64url');
 t.mock.method(globalThis,'fetch',async url=>{
  if(url==='https://firebaseappcheck.googleapis.com/v1/jwks')return keys(url);
  assert.equal(url,'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  return Response.json({keys:[publicKey(identity,'identity-integration-key')]});
 });
 const db=memoryDb();
 const api=configure({FIREBASE_PROJECT_ID:projectId,FIREBASE_APP_ID:appId,ALLOWED_ORIGINS:'https://tropi.web.app',WHATSAPP_ENABLED:'false'},{db});
 const input={requestKey:'signed-order-test-00001',name:'Cliente de teste',phone:'88999999999',payment:'Pix',delivery:'Retirada',lines:[{productId:'suco-laranja',qty:1,extras:[],reward:false}],whatsappOptIn:false};
 const request=appToken=>new Request('https://example.test/api/createOrder',{method:'POST',headers:{origin:'https://tropi.web.app',authorization:'Bearer '+identityToken,'x-firebase-appcheck':appToken,'content-type':'application/json'},body:JSON.stringify(input)});
 const denied=await api.handle(request(token({pair:other})));
 assert.equal(denied.status,403);
 assert.equal(db.store.size,0);
 const response=await api.handle(request(token()));
 assert.equal(response.status,200);
 const first=await response.json();
 assert.equal(first.order.customer.id,'real-signed-customer');
 assert.equal(first.order.total,700);
 assert.equal(first.order.id,'TROPI-001');
 const duplicate=await api.handle(request(token()));
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).duplicate,true);
 assert.equal(db.store.get('controls/orderCounter').value,1);
});

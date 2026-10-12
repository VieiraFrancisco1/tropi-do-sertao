'use strict';
// Validate Firebase ID tokens with Google's public JWKs. No JWT field is trusted before signature verification.
const keysetUrl='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let savedKeys=[], refreshAt=0;
const decode = segment => JSON.parse(Buffer.from(segment,'base64url').toString('utf8'));
async function verifyFirebaseToken(jwt, projectId, {fetchImpl=fetch,now=Date.now}={}) {
  if(typeof jwt!=='string'||jwt.length>8192)throw new Error('Invalid Firebase identity token');
  const pieces=jwt.split('.');if(pieces.length!==3)throw new Error('Invalid Firebase identity token');
  let header,body;
  try{header=decode(pieces[0]);body=decode(pieces[1]);}catch{throw new Error('Malformed Firebase identity token');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||!body||typeof body!=='object')throw new Error('Invalid Firebase identity token');
  const time=now()/1000;
  if(body.aud!==projectId||body.iss!=='https://securetoken.google.com/'+projectId||typeof body.sub!=='string'||!body.sub||body.sub.length>128||!Number.isFinite(body.exp)||body.exp<=time||!Number.isFinite(body.iat)||body.iat>time||!Number.isFinite(body.auth_time)||body.auth_time>time)throw new Error('Expired or invalid identity');
  if(refreshAt<=now()||!savedKeys.find(k=>k.kid===header.kid)){
    const res=await fetchImpl(keysetUrl);
    if(!res.ok)throw new Error('Firebase signing keys unavailable');
    const json=await res.json();if(!Array.isArray(json.keys))throw new Error('Invalid signing keys');
    savedKeys=json.keys;
    const maxAge=Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||600);
    refreshAt=now()+Math.min(3600,Math.max(60,maxAge))*1000;
  }
  const jwk=savedKeys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256');
  if(!jwk)throw new Error('Unknown Firebase signing key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signed=new TextEncoder().encode(pieces[0]+'.'+pieces[1]);
  const sig=Buffer.from(pieces[2],'base64url');
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,sig,signed))throw new Error('Invalid token signature');
  return {uid:body.sub,admin:body.tropiAdmin===true};
}
const appCheckKeysUrl='https://firebaseappcheck.googleapis.com/v1/jwks';
let appCheckKeys=[],appCheckRefreshAt=0;
// Standard App Check session tokens are verified like Admin SDK verifyToken(),
// without the optional one-time-token consumption API or additional IAM roles.
// https://firebase.google.com/docs/app-check/custom-resource-backend
async function verifyAppCheck(jwt, appId, {fetchImpl=fetch,now=Date.now}={}) {
  const projectNumber=typeof appId==='string'?appId.split(':')[1]:'';
  if(!/^1:\d+:(web|android|ios):[a-zA-Z0-9]+$/.test(appId||'')||!/^\d+$/.test(projectNumber))throw new Error('Missing Firebase app configuration');
  if(typeof jwt!=='string'||jwt.length>8192)throw new Error('Missing Firebase App Check');
  const pieces=jwt.split('.');
  if(pieces.length!==3||pieces.some(piece=>!piece||!/^[A-Za-z0-9_-]+$/.test(piece)))throw new Error('Invalid App Check token');
  let header,body;
  try{header=decode(pieces[0]);body=decode(pieces[1]);}catch{throw new Error('Malformed App Check token');}
  const time=now()/1000;
  if(header?.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||!header.kid||!body||typeof body!=='object'
    ||body.iss!=='https://firebaseappcheck.googleapis.com/'+projectNumber
    ||!Array.isArray(body.aud)||!body.aud.includes('projects/'+projectNumber)||body.sub!==appId
    ||!Number.isFinite(body.exp)||body.exp<=time||!Number.isFinite(body.iat)||body.iat>time||body.exp<=body.iat)throw new Error('Expired or invalid App Check token');
  if(appCheckRefreshAt<=now()||!appCheckKeys.find(key=>key.kid===header.kid)){
    const response=await fetchImpl(appCheckKeysUrl);
    if(!response.ok)throw new Error('App Check signing keys unavailable');
    const result=await response.json();
    if(!Array.isArray(result.keys)||!result.keys.length)throw new Error('Invalid App Check signing keys');
    appCheckKeys=result.keys;
    const maxAge=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||3600);
    appCheckRefreshAt=now()+Math.min(21600,Math.max(60,maxAge))*1000;
  }
  const jwk=appCheckKeys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256'));
  if(!jwk)throw new Error('Unknown App Check signing key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signed=new TextEncoder().encode(pieces[0]+'.'+pieces[1]);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Buffer.from(pieces[2],'base64url'),signed))throw new Error('Invalid App Check signature');
  return {appId:body.sub};
}
module.exports={verifyFirebaseToken,verifyAppCheck};

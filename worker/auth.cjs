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
async function verifyAppCheck(appCheckToken, projectId, db, {fetchImpl=fetch}={}) {
  if(typeof appCheckToken!=='string'||appCheckToken.length>8000)throw new Error('Missing Firebase App Check');
  const token=await db.accessToken();
  const result=await fetchImpl(`https://firebaseappcheck.googleapis.com/v1beta/projects/${encodeURIComponent(projectId)}:verifyAppCheckToken`,{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({appCheckToken})
  });
  if(!result.ok)throw new Error('Firebase App Check validation failed');
  return true;
}
module.exports={verifyFirebaseToken,verifyAppCheck};

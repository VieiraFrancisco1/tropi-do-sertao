'use strict';
// Minimal Firestore REST adapter for the existing tested Tropi business rules.
// Uses OAuth 2 service-account identity on the SERVER. Never ship the key to Firebase Hosting.
const { webcrypto } = require('node:crypto');
const subtle = globalThis.crypto?.subtle || webcrypto.subtle;
const encoder = new TextEncoder();
const b64url = bytes => Buffer.from(bytes).toString('base64url');
function valueOf(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid Firestore number');
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(valueOf) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,valueOf(v)])) } };
  throw new Error('Unsupported Firestore value');
}
function fromValue(v) {
  if (!v) return undefined;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k,fromValue(x)]));
  throw new Error('Unexpected Firestore value');
}
const docData = doc => doc?.fields ? Object.fromEntries(Object.entries(doc.fields).map(([k,v]) => [k,fromValue(v)])) : {};
const fieldsOf = data => valueOf(data).mapValue.fields;
function leafPaths(obj, prefix = '') {
  const paths = [];
  for (const [k,v] of Object.entries(obj)) {
    const path = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) paths.push(...leafPaths(v,path));
    else paths.push(path);
  }
  return paths;
}
function dottedToNested(data) {
  const obj = {};
  for (const [path,value] of Object.entries(data)) {
    if (value === undefined) continue;
    const parts = path.split('.'); let root = obj;
    for (const segment of parts.slice(0,-1)) root = root[segment] ||= {};
    root[parts.at(-1)] = value;
  }
  return obj;
}
class DbError extends Error { constructor(status,message,code){super(message);this.status=status;this.code=code;} }
function createFirestore({ projectId, serviceAccount, fetchImpl = fetch, now = Date.now }) {
  if (!/^[a-z][\w-]{4,35}$/.test(projectId || '') || !serviceAccount?.client_email || !serviceAccount?.private_key) throw new Error('Invalid backend Firebase project/service-account configuration');
  const base = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';
  let cachedToken = '', tokenExpires = 0;
  async function token() {
    if (cachedToken && tokenExpires > now() + 90000) return cachedToken;
    const key = await subtle.importKey('pkcs8', Buffer.from(serviceAccount.private_key.replace(/-----[^-]+-----|\s/g,''),'base64'), { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },false,['sign']);
    const iat=Math.floor(now()/1000);
    const header=b64url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
    const body=b64url(encoder.encode(JSON.stringify({iss:serviceAccount.client_email,scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3500})));
    const content=header+'.'+body;
    const signed=b64url(await subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(content)));
    const form = new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:content+'.'+signed});
    const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString()});
    const result=await response.json();
    if (!response.ok || !result.access_token) {
      const code=['invalid_grant','invalid_client','unauthorized_client','invalid_scope'].includes(result.error)?result.error.toUpperCase():'OAUTH_UNAVAILABLE';
      throw new DbError(response.status||503,'Could not authenticate Firebase service account',code);
    }
    cachedToken=result.access_token;tokenExpires=now()+Math.min(result.expires_in||3300,3500)*1000;
    return cachedToken;
  }
  async function request(path,{method='GET',body}={}) {
    const bearer=await token();
    const response=await fetchImpl('https://firestore.googleapis.com/v1/'+path,{method,headers:{authorization:'Bearer '+bearer, ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const content=await response.text();
    let parsed={};try { parsed=content?JSON.parse(content):{}; } catch { if(response.ok) throw new Error('Unexpected Firestore response'); }
    if (!response.ok) throw new DbError(response.status,parsed.error?.message || 'Firestore request failed',parsed.error?.status);
    return parsed;
  }
  const pathFor = path => {
    if (typeof path !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(path)) throw new Error('Invalid Firestore document path');
    return base+'/'+path;
  };
  const rel = url => url.replace('https://firestore.googleapis.com/v1/','');
  function snap(path,result){return {id:path.split('/').at(-1),ref:doc(path),exists:!!result?.name,data:()=>result?.name?docData(result):undefined};}
  function writes(method,ref,data,opts={}) {
    const nested = method==='update' ? dottedToNested(data) : data;
    const update = {name:rel(pathFor(ref.path)),fields:fieldsOf(nested)};
    const write = {update};
    if (method==='create') write.currentDocument={exists:false};
    else if (method==='update') {write.currentDocument={exists:true};write.updateMask={fieldPaths:Object.keys(data)};}
    else if (opts.merge) write.updateMask={fieldPaths:leafPaths(nested)};
    return write;
  }
  function doc(path) {
    const ref = {path,id:path.split('/').at(-1)};
    ref.get = async()=>{try{return snap(path,await request(rel(pathFor(path))));}catch(e){if(e.status===404)return snap(path,null);throw e;}};
    ref.set = async(data,opts)=>{await request(rel(base)+':commit',{method:'POST',body:{writes:[writes('set',ref,data,opts)]}});};
    ref.update = async(data)=>{await request(rel(base)+':commit',{method:'POST',body:{writes:[writes('update',ref,data)]}});};
    return ref;
  }
  function collection(name) {
    const conditions=[];let max=Infinity;
    const chain={
      where(field,operator,val){conditions.push({field,operator,val});return chain;},
      limit(n){max=n;return chain;},
      async get(){
        const ops={'==':'EQUAL','>=':'GREATER_THAN_OR_EQUAL','<=':'LESS_THAN_OR_EQUAL','<':'LESS_THAN','>':'GREATER_THAN'};
        const filters=conditions.map(c=>({fieldFilter:{field:{fieldPath:c.field},op:ops[c.operator],value:valueOf(c.val)}}));
        if(filters.some(f=>!f.fieldFilter.op))throw new Error('Invalid Firestore query operator');
        const query={from:[{collectionId:name}], ...(Number.isFinite(max)?{limit:max}:{}), ...(filters.length?{where:filters.length===1?filters[0]:{compositeFilter:{op:'AND',filters}}}:{})};
        const raw=await request(rel(base)+':runQuery',{method:'POST',body:{structuredQuery:query}});
        const rows=Array.isArray(raw)?raw:raw.document?[raw]:[];
        return {docs:rows.filter(x=>x.document?.name).map(x=>{const d=x.document;return {id:d.name.split('/').at(-1),data:()=>docData(d)}})};
      }
    };return chain;
  }
  async function runTransaction(callback){
    for(let attempt=0;attempt<4;attempt++){
      const started=await request(rel(base)+':beginTransaction',{method:'POST',body:{}});
      const writesList=[];
      const tx={
        get:async ref=>{try{return snap(ref.path,await request(rel(pathFor(ref.path))+'?transaction='+encodeURIComponent(started.transaction)));}catch(e){if(e.status===404)return snap(ref.path,null);throw e;}},
        create:(ref,data)=>writesList.push(writes('create',ref,data)),
        set:(ref,data,opts)=>writesList.push(writes('set',ref,data,opts)),
        update:(ref,data)=>writesList.push(writes('update',ref,data))
      };
      try{
        const result=await callback(tx);
        if(writesList.length)await request(rel(base)+':commit',{method:'POST',body:{transaction:started.transaction,writes:writesList}});
        else await request(rel(base)+':rollback',{method:'POST',body:{transaction:started.transaction}});
        return result;
      }catch(e){
        await request(rel(base)+':rollback',{method:'POST',body:{transaction:started.transaction}}).catch(()=>{});
        if((e.status===409||e.code==='ABORTED')&&attempt<3)continue;
        throw e;
      }
    }
    throw new Error('Firestore transaction retries exhausted');
  }
  return {doc,collection,runTransaction,accessToken:token};
}
module.exports={createFirestore,valueOf,fromValue,fieldsOf,docData,dottedToNested,DbError};

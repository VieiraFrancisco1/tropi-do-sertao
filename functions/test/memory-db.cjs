'use strict';
// Serialized transactions model Firestore's conflict retries for business tests.
function memoryDb(){
 const store=new Map();let queue=Promise.resolve(),queries=0;
 const merge=(base,value)=>{for(const [key,item]of Object.entries(value))base[key]=item&&typeof item==='object'&&!Array.isArray(item)?merge(base[key]||{},item):item;return base;};
 const write=(path,value,options)=>store.set(path,options?.merge?merge(structuredClone(store.get(path)||{}),structuredClone(value)):structuredClone(value));
 const snap=path=>({id:path.split('/').at(-1),exists:store.has(path),data:()=>structuredClone(store.get(path))});
 const doc=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path),set:async(value,options)=>write(path,value,options)});
 return {store,doc,get queries(){return queries;},
  runTransaction(callback){
   const result=queue.then(async()=>{
    const writes=[];
    const tx={get:async ref=>{if(writes.length)throw new Error('Transaction read after write');return snap(ref.path);},
     create:(ref,value)=>writes.push(()=>{if(store.has(ref.path))throw new Error('Document exists');write(ref.path,value);}),
     set:(ref,value,options)=>writes.push(()=>write(ref.path,value,options)),
     update:(ref,value)=>writes.push(()=>{const next=structuredClone(store.get(ref.path)||{});for(const [key,item]of Object.entries(value)){const parts=key.split('.');let cursor=next;for(const p of parts.slice(0,-1))cursor=cursor[p]||={};cursor[parts.at(-1)]=item;}write(ref.path,next);})};
    const result=await callback(tx);for(const write of writes)write();return result;
   });queue=result.catch(()=>{});return result;
  },
  collection(name){const conditions=[];let limit=Infinity;return{
   where(key,op,value){conditions.push([key,op,value]);return this;},limit(value){limit=value;return this;},
   async get(){queries++;return{docs:[...store.entries()].filter(([path])=>path.startsWith(name+'/')).filter(([,data])=>conditions.every(([key,op,value])=>{
    const item=key.split('.').reduce((v,p)=>v?.[p],data);return op==='=='?item===value:op==='>='?item>=value:op==='<='?item<=value:false;
   })).slice(0,limit).map(([path,data])=>({id:path.split('/').at(-1),data:()=>structuredClone(data)}))};}
  };}
 };
}
module.exports={memoryDb};

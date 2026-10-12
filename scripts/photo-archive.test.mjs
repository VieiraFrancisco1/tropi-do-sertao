import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unpackTropiPhotos,REQUIRED_PHOTOS} from './photo-archive.mjs';
test('rejeita arquivo ZIP invalido',()=>assert.throws(()=>unpackTropiPhotos(Buffer.from('invalido')),/ZIP valido/));
test('confere as 13 fotos dos produtos quando o pacote for enviado',async()=>{
 let buf;
 try{buf=await readFile(new URL('../assets/fotos-tropi-2026.zip',import.meta.url));}
 catch(err){if(err.code==='ENOENT')return;throw err;}
 const photos=unpackTropiPhotos(buf);
 for(const name of REQUIRED_PHOTOS)assert.ok(photos.get(name)?.length>10000,name);
});